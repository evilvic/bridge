import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { integration: v.string() },
  handler: async ({ db }, { integration }) => {
    return db
      .query("integration_validations")
      .withIndex("by_integration", (q) => q.eq("integration", integration))
      .first();
  }
});

export const list = query({
  args: {},
  handler: async ({ db }) => {
    return db.query("integration_validations").collect();
  }
});

export const set = mutation({
  args: {
    integration: v.string(),
    status: v.string(),
    last_checked_at: v.string(),
    last_error_code: v.optional(v.string()),
    last_error_detail: v.optional(v.string()),
    last_webhook_received_at: v.optional(v.string())
  },
  handler: async ({ db }, args) => {
    const existing = await db
      .query("integration_validations")
      .withIndex("by_integration", (q) => q.eq("integration", args.integration))
      .first();
    if (existing) {
      await db.patch(existing._id, args);
      return;
    }
    await db.insert("integration_validations", args);
  }
});

export const markWebhookReceived = mutation({
  args: { integration: v.string() },
  handler: async ({ db }, { integration }) => {
    const now = new Date().toISOString();
    const existing = await db
      .query("integration_validations")
      .withIndex("by_integration", (q) => q.eq("integration", integration))
      .first();
    if (existing) {
      await db.patch(existing._id, {
        last_webhook_received_at: now
      });
      return;
    }
    await db.insert("integration_validations", {
      integration,
      status: "unknown",
      last_checked_at: now,
      last_webhook_received_at: now
    });
  }
});
