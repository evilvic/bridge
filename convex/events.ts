import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const record = mutation({
  args: {
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
  },
  handler: async ({ db }, args) => {
    await db.insert("events", args);
  }
});

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async ({ db }, { limit }) => {
    const items = await db.query("events").collect();
    const sorted = items.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return sorted.slice(0, limit ?? 50);
  }
});
