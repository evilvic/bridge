export function maskE164(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return trimmed;
  const last4 = trimmed.slice(-4);
  const prefix = trimmed.startsWith("+") ? "+" : "";
  return `${prefix}****${last4}`;
}
