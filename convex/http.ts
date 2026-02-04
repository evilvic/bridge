import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { getEnv, normalizeWhatsAppNumber } from "../shared/normalize";
import { log } from "./utils/logger";

const http = httpRouter();

http.route({
  path: "/webhooks/twilio/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const receivedAt = new Date().toISOString();
    const rawBody = await request.text();
    const form = parseForm(rawBody);

    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    const signature = request.headers.get("x-twilio-signature");
    const signatureOk = await verifyTwilioSignature({
      signature,
      url: request.url,
      body: form,
      authToken: twilioAuthToken
    });

    const routing = await ctx.runQuery(api.routing.getActive, {});
    const numberTo = normalizeWhatsAppNumber(form.To ?? "");
    const workspaceId = routing?.intercom_workspace_id ?? "unknown";
    const messageSid = form.MessageSid;
    const idempotencyKey =
      messageSid ||
      `${numberTo}:${normalizeWhatsAppNumber(form.From ?? "")}:${receivedAt}`;

    if (!signatureOk) {
      log({
        level: "warn",
        msg: "Twilio signature invalid",
        env: getEnv(process.env.APP_ENV),
        integration: "twilio"
      });
      await ctx.runMutation(api.events.record, {
        env: getEnv(process.env.APP_ENV),
        workspace_id: workspaceId,
        number_to: numberTo,
        direction: "twilio_to_intercom",
        status: "dropped",
        error_code: "signature_invalid",
        error_detail: "Twilio signature validation failed",
        twilio_message_sid: messageSid,
        idempotency_key: idempotencyKey,
        timestamp: receivedAt,
        retry_count: 0
      });
      return twimlResponse("", 401);
    }

    if (!routing || !routing.enabled || routing.number_to !== numberTo) {
      const errorCode = !routing
        ? "routing_not_found"
        : routing.enabled
          ? "routing_mismatch"
          : "routing_disabled";
      log({
        level: "warn",
        msg: "Twilio routing invalid",
        env: getEnv(process.env.APP_ENV),
        integration: "twilio"
      });
      await ctx.runMutation(api.events.record, {
        env: getEnv(process.env.APP_ENV),
        workspace_id: workspaceId,
        number_to: numberTo,
        direction: "twilio_to_intercom",
        status: "dropped",
        error_code: errorCode,
        error_detail: "Routing config missing or disabled",
        twilio_message_sid: messageSid,
        idempotency_key: idempotencyKey,
        timestamp: receivedAt,
        retry_count: 0
      });
      return twimlResponse("", 409);
    }

    await ctx.runMutation(api.events.record, {
      env: getEnv(process.env.APP_ENV),
      workspace_id: workspaceId,
      number_to: numberTo,
      direction: "twilio_to_intercom",
      status: "queued",
      twilio_message_sid: messageSid,
      idempotency_key: idempotencyKey,
      timestamp: receivedAt,
      retry_count: 0
    });

    await ctx.runMutation(api.validations.markWebhookReceived, {
      integration: "twilio"
    });

    return twimlResponse("");
  })
});

http.route({
  path: "/webhooks/intercom",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const receivedAt = new Date().toISOString();
    const rawBody = await request.text();
    const payload = rawBody ? safeJson(rawBody) : {};

    const signature = request.headers.get("x-hub-signature");
    const intercomSecret = process.env.INTERCOM_WEBHOOK_SECRET ?? "";
    const signatureOk = await verifyIntercomSignature({
      signature,
      body: rawBody,
      secret: intercomSecret
    });

    const routing = await ctx.runQuery(api.routing.getActive, {});
    const numberTo = normalizeWhatsAppNumber(routing?.number_to ?? "");
    const workspaceId =
      routing?.intercom_workspace_id ?? getWorkspaceId(payload) ?? "unknown";
    const conversationId = getConversationId(payload);
    const topic = getTopic(payload);
    const idempotencyKey = `${conversationId ?? "unknown"}:${
      topic ?? "unknown"
    }:${receivedAt}`;

    if (!signatureOk) {
      log({
        level: "warn",
        msg: "Intercom signature invalid",
        env: getEnv(process.env.APP_ENV),
        integration: "intercom"
      });
      await ctx.runMutation(api.events.record, {
        env: getEnv(process.env.APP_ENV),
        workspace_id: workspaceId,
        number_to: numberTo,
        direction: "intercom_to_twilio",
        status: "dropped",
        error_code: "signature_invalid",
        error_detail: "Intercom signature validation failed",
        intercom_conversation_id: conversationId ?? undefined,
        idempotency_key: idempotencyKey,
        timestamp: receivedAt,
        retry_count: 0
      });
      return json({ ok: false, error: "signature_invalid" }, 401);
    }

    if (topic !== "conversation.admin.replied") {
      await ctx.runMutation(api.events.record, {
        env: getEnv(process.env.APP_ENV),
        workspace_id: workspaceId,
        number_to: numberTo,
        direction: "intercom_to_twilio",
        status: "dropped",
        error_code: "unsupported_topic",
        error_detail: `Unsupported topic: ${topic ?? "unknown"}`,
        intercom_conversation_id: conversationId ?? undefined,
        idempotency_key: idempotencyKey,
        timestamp: receivedAt,
        retry_count: 0
      });
      return json({ ok: true, ignored: true });
    }

    await ctx.runMutation(api.events.record, {
      env: getEnv(process.env.APP_ENV),
      workspace_id: workspaceId,
      number_to: numberTo,
      direction: "intercom_to_twilio",
      status: "queued",
      intercom_conversation_id: conversationId ?? undefined,
      idempotency_key: idempotencyKey,
      timestamp: receivedAt,
      retry_count: 0
    });

    await ctx.runMutation(api.validations.markWebhookReceived, {
      integration: "intercom"
    });

    return json({ ok: true });
  })
});

function parseForm(body: string): Record<string, string> {
  const params = new URLSearchParams(body);
  const out: Record<string, string> = {};
  params.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}


function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getTopic(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.topic === "string") return payload.topic;
  const data = payload.data as Record<string, unknown> | undefined;
  const item = data?.item as Record<string, unknown> | undefined;
  if (typeof item?.type === "string") return item.type;
  return undefined;
}

function getConversationId(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  const item = data?.item as Record<string, unknown> | undefined;
  if (typeof item?.id === "string") return item.id;
  if (typeof item?.conversation_id === "string") return item.conversation_id;
  return undefined;
}

function getWorkspaceId(payload: Record<string, unknown>): string | undefined {
  const data = payload.data as Record<string, unknown> | undefined;
  if (typeof data?.workspace_id === "string") return data.workspace_id;
  return undefined;
}

async function verifyTwilioSignature(params: {
  signature: string | null;
  url: string;
  body: Record<string, string>;
  authToken: string;
}): Promise<boolean> {
  const { signature, url, body, authToken } = params;
  if (!signature || !authToken) return false;
  const sorted = Object.keys(body)
    .sort()
    .map((key) => `${key}${body[key]}`)
    .join("");
  const data = `${url}${sorted}`;
  const expected = await hmacBase64(authToken, data);
  return safeEqual(signature, expected);
}

async function verifyIntercomSignature(params: {
  signature: string | null;
  body: string;
  secret: string;
}): Promise<boolean> {
  const { signature, body, secret } = params;
  if (!signature || !secret) return false;
  const normalized = signature.replace(/^sha1=/, "");
  const expected = await hmacHex(secret, body);
  return safeEqual(normalized, expected);
}

async function hmacBase64(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  const bytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  const bytes = new Uint8Array(signature);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function twimlResponse(message: string, status = 200): Response {
  const body = message ? `<Response><Message>${escapeXml(message)}</Message></Response>` : "<Response></Response>";
  return new Response(body, {
    status,
    headers: { "content-type": "text/xml" }
  });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default http;
