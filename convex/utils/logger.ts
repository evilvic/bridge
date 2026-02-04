type LogLevel = "info" | "warn" | "error";

type LogInput = {
  level: LogLevel;
  msg: string;
  env: "dev" | "prod";
  integration?: "twilio" | "intercom";
  request_id?: string;
  correlation_id?: string;
};

export function log(input: LogInput): void {
  const payload = {
    level: input.level,
    msg: input.msg,
    env: input.env,
    integration: input.integration,
    request_id: input.request_id,
    correlation_id: input.correlation_id,
    timestamp: new Date().toISOString()
  };
  console.log(JSON.stringify(stripUndefined(payload)));
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as T;
}
