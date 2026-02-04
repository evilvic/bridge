export type ValidationStatus = "unknown" | "ok" | "failed";
export type Direction = "twilio_to_intercom" | "intercom_to_twilio";
export type EventStatus = "queued" | "ok" | "retrying" | "failed" | "dropped";

export type RoutingConfig = {
  number_to: string;
  intercom_workspace_id: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type IntegrationValidation = {
  integration: "twilio" | "intercom";
  status: ValidationStatus;
  last_checked_at: string;
  last_error_code?: string;
  last_error_detail?: string;
  last_webhook_received_at?: string;
};

export type EventRecord = {
  env: "poc";
  workspace_id: string;
  number_to: string;
  direction: Direction;
  status: EventStatus;
  error_code?: string;
  error_detail?: string;
  twilio_message_sid?: string;
  intercom_conversation_id?: string;
  idempotency_key: string;
  timestamp: string;
  retry_count: number;
};
