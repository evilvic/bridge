import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  routing_configs: defineTable({
    number_to: v.string(),
    intercom_workspace_id: v.string(),
    enabled: v.boolean(),
    created_at: v.string(),
    updated_at: v.string()
  }),
  idempotency: defineTable({
    key: v.string(),
    direction: v.string(),
    status: v.string(),
    created_at: v.string(),
    updated_at: v.string(),
    last_error_code: v.optional(v.string())
  })
    .index("by_key", ["key"])
    .index("by_key_direction", ["key", "direction"]),
  contacts_map: defineTable({
    workspace_id: v.string(),
    external_id: v.string(),
    intercom_contact_id: v.string(),
    created_at: v.string(),
    updated_at: v.string()
  }).index("by_workspace_external", ["workspace_id", "external_id"]),
  conversations_map: defineTable({
    workspace_id: v.string(),
    external_id: v.string(),
    intercom_conversation_id: v.string(),
    created_at: v.string(),
    updated_at: v.string()
  }).index("by_workspace_external", ["workspace_id", "external_id"]),
  events: defineTable({
    env: v.string(),
    workspace_id: v.string(),
    number_to: v.string(),
    direction: v.string(),
    status: v.string(),
    error_code: v.optional(v.string()),
    error_detail: v.optional(v.string()),
    twilio_message_sid: v.optional(v.string()),
    intercom_conversation_id: v.optional(v.string()),
    idempotency_key: v.string(),
    timestamp: v.string(),
    retry_count: v.number()
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_idempotency", ["idempotency_key"]),
  integration_validations: defineTable({
    integration: v.string(),
    status: v.string(),
    last_checked_at: v.string(),
    last_error_code: v.optional(v.string()),
    last_error_detail: v.optional(v.string()),
    last_webhook_received_at: v.optional(v.string())
  }).index("by_integration", ["integration"])
});
