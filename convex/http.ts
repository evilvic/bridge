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

    void processTwilioInbound(ctx, {
      idempotencyKey,
      messageSid: messageSid ?? idempotencyKey,
      from: form.From ?? "",
      to: form.To ?? "",
      body: form.Body ?? "",
      numMedia: form.NumMedia ?? "0",
      media: extractMedia(form)
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

type TwilioInboundPayload = {
  idempotencyKey: string;
  messageSid: string;
  from: string;
  to: string;
  body: string;
  numMedia: string;
  media: Array<{ url: string; contentType?: string }>;
};

async function processTwilioInbound(ctx: any, payload: TwilioInboundPayload) {
  const env = getEnv(process.env.APP_ENV);
  const direction = "twilio_to_intercom";
  const fromE164 = normalizeWhatsAppNumber(payload.from);
  const toE164 = normalizeWhatsAppNumber(payload.to);
  const externalId = `wa:${fromE164}`;

  const existing = await ctx.runQuery(api.idempotency.get, {
    key: payload.messageSid,
    direction
  });
  if (existing?.status === "done") {
    await ctx.runMutation(api.events.updateByIdempotency, {
      idempotency_key: payload.idempotencyKey,
      status: "dropped",
      error_code: "duplicate",
      error_detail: "MessageSid already processed"
    });
    return;
  }

  if (existing?.status === "processing") {
    await ctx.runMutation(api.events.updateByIdempotency, {
      idempotency_key: payload.idempotencyKey,
      status: "dropped",
      error_code: "duplicate_processing",
      error_detail: "MessageSid is already processing"
    });
    return;
  }

  await ctx.runMutation(api.idempotency.start, {
    key: payload.messageSid,
    direction
  });

  const routing = await ctx.runQuery(api.routing.getActive, {});
  if (!routing || !routing.enabled || routing.number_to !== toE164) {
    await ctx.runMutation(api.events.updateByIdempotency, {
      idempotency_key: payload.idempotencyKey,
      status: "failed",
      error_code: "missing_routing",
      error_detail: "No routing config for number"
    });
    await ctx.runMutation(api.idempotency.markFailed, {
      key: payload.messageSid,
      direction,
      error_code: "missing_routing"
    });
    return;
  }

  const intercomToken = process.env.INTERCOM_ACCESS_TOKEN ?? "";
  if (!intercomToken) {
    await ctx.runMutation(api.events.updateByIdempotency, {
      idempotency_key: payload.idempotencyKey,
      status: "failed",
      error_code: "auth_invalid",
      error_detail: "Missing Intercom access token"
    });
    await ctx.runMutation(api.idempotency.markFailed, {
      key: payload.messageSid,
      direction,
      error_code: "auth_invalid"
    });
    return;
  }

  try {
    const contactId = await getOrCreateContact({
      token: intercomToken,
      externalId
    });
    await ctx.runMutation(api.contacts.upsert, {
      workspace_id: routing.intercom_workspace_id,
      external_id: externalId,
      intercom_contact_id: contactId
    });

    const existingConversation = await ctx.runQuery(api.conversations.getByExternal, {
      workspace_id: routing.intercom_workspace_id,
      external_id: externalId
    });

    const body = buildBody(payload.body, payload.media);
    let conversationId: string;
    if (existingConversation?.intercom_conversation_id) {
      conversationId = await replyConversation({
        token: intercomToken,
        conversationId: existingConversation.intercom_conversation_id,
        contactId,
        body
      });
    } else {
      conversationId = await createConversation({
        token: intercomToken,
        contactId,
        body
      });
      await ctx.runMutation(api.conversations.upsert, {
        workspace_id: routing.intercom_workspace_id,
        external_id: externalId,
        intercom_conversation_id: conversationId
      });
    }

    await ctx.runMutation(api.events.updateByIdempotency, {
      idempotency_key: payload.idempotencyKey,
      status: "ok",
      intercom_conversation_id: conversationId
    });
    await ctx.runMutation(api.idempotency.markDone, {
      key: payload.messageSid,
      direction
    });
  } catch (error) {
    const normalized = normalizeIntercomError(error);
    await ctx.runMutation(api.events.updateByIdempotency, {
      idempotency_key: payload.idempotencyKey,
      status: "failed",
      error_code: normalized.code,
      error_detail: normalized.detail
    });
    await ctx.runMutation(api.idempotency.markFailed, {
      key: payload.messageSid,
      direction,
      error_code: normalized.code
    });
    log({
      level: "error",
      msg: normalized.detail,
      env,
      integration: "intercom"
    });
  }
}

function extractMedia(form: Record<string, string>): Array<{ url: string; contentType?: string }> {
  const num = Number(form.NumMedia ?? "0");
  const media: Array<{ url: string; contentType?: string }> = [];
  for (let i = 0; i < num; i += 1) {
    const url = form[`MediaUrl${i}`];
    if (!url) continue;
    media.push({ url, contentType: form[`MediaContentType${i}`] });
  }
  return media;
}

function buildBody(body: string, media: Array<{ url: string }>): string {
  if (!media.length) return body;
  const mediaLines = media.map((item) => `Media: ${item.url}`);
  return [body, ...mediaLines].filter(Boolean).join("\n");
}

async function getOrCreateContact(params: { token: string; externalId: string }): Promise<string> {
  const existing = await searchContact(params);
  if (existing) return existing;
  const response = await fetch("https://api.intercom.io/contacts", {
    method: "POST",
    headers: intercomHeaders(params.token),
    body: JSON.stringify({
      external_id: params.externalId
    })
  });
  const json = await response.json();
  if (!response.ok) throw intercomError(response.status, json);
  return json.id as string;
}

async function searchContact(params: { token: string; externalId: string }): Promise<string | null> {
  const response = await fetch("https://api.intercom.io/contacts/search", {
    method: "POST",
    headers: intercomHeaders(params.token),
    body: JSON.stringify({
      query: { field: "external_id", operator: "=", value: params.externalId }
    })
  });
  const json = await response.json();
  if (!response.ok) throw intercomError(response.status, json);
  const data = json.data as Array<{ id: string }> | undefined;
  if (!data || data.length === 0) return null;
  return data[0].id;
}

async function createConversation(params: {
  token: string;
  contactId: string;
  body: string;
}): Promise<string> {
  const response = await fetch("https://api.intercom.io/conversations", {
    method: "POST",
    headers: intercomHeaders(params.token),
    body: JSON.stringify({
      from: { type: "contact", id: params.contactId },
      body: params.body
    })
  });
  const json = await response.json();
  if (!response.ok) throw intercomError(response.status, json);
  return json.id as string;
}

async function replyConversation(params: {
  token: string;
  conversationId: string;
  contactId: string;
  body: string;
}): Promise<string> {
  const response = await fetch(
    `https://api.intercom.io/conversations/${params.conversationId}/reply`,
    {
      method: "POST",
      headers: intercomHeaders(params.token),
      body: JSON.stringify({
        message_type: "comment",
        type: "contact",
        id: params.contactId,
        body: params.body
      })
    }
  );
  const json = await response.json();
  if (!response.ok) throw intercomError(response.status, json);
  return params.conversationId;
}

function intercomHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Intercom-Version": "2.12"
  };
}

function intercomError(status: number, payload: Record<string, unknown>) {
  return {
    status,
    payload
  };
}

function normalizeIntercomError(error: unknown): { code: string; detail: string } {
  if (typeof error === "object" && error && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401 || status === 403) {
      return { code: "auth_invalid", detail: "Intercom auth invalid" };
    }
    if (status === 429) {
      return { code: "rate_limited", detail: "Intercom rate limited" };
    }
    return { code: "intercom_error", detail: `Intercom error ${status}` };
  }
  return { code: "unknown", detail: "Unknown Intercom error" };
}
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
