export type Env = "dev" | "prod";

export function normalizeE164(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("whatsapp:")) {
    return normalizeE164(trimmed.replace(/^whatsapp:/, ""));
  }
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (!digits) return "";
  return `+${digits}`;
}

export function toWhatsAppExternalId(e164: string): string {
  const normalized = normalizeE164(e164);
  return normalized ? `wa:${normalized}` : "";
}

export function normalizeWhatsAppNumber(value: string): string {
  return normalizeE164(value);
}

export function getEnv(input?: string | null): Env {
  const raw = (input ?? "").toLowerCase();
  if (raw === "prod") return "prod";
  return "dev";
}
