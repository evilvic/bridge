import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { key: v.string(), direction: v.string() },
  handler: async ({ db }, { key, direction }) => {
    return db
      .query("idempotency")
      .withIndex("by_key_direction", (q) => q.eq("key", key).eq("direction", direction))
      .first();
  }
});

export const start = mutation({
  args: { key: v.string(), direction: v.string() },
  handler: async ({ db }, { key, direction }) => {
    const now = new Date().toISOString();
    const existing = await db
      .query("idempotency")
      .withIndex("by_key_direction", (q) => q.eq("key", key).eq("direction", direction))
      .first();
    if (existing) {
      return existing;
    }
    const payload = {
      key,
      direction,
      status: "processing",
      created_at: now,
      updated_at: now
    };
    await db.insert("idempotency", payload);
    return payload;
  }
});

export const markDone = mutation({
  args: { key: v.string(), direction: v.string() },
  handler: async ({ db }, { key, direction }) => {
    const now = new Date().toISOString();
    const existing = await db
      .query("idempotency")
      .withIndex("by_key_direction", (q) => q.eq("key", key).eq("direction", direction))
      .first();
    if (existing) {
      await db.patch(existing._id, { status: "done", updated_at: now });
    }
  }
});

export const markFailed = mutation({
  args: { key: v.string(), direction: v.string(), error_code: v.string() },
  handler: async ({ db }, { key, direction, error_code }) => {
    const now = new Date().toISOString();
    const existing = await db
      .query("idempotency")
      .withIndex("by_key_direction", (q) => q.eq("key", key).eq("direction", direction))
      .first();
    if (existing) {
      await db.patch(existing._id, {
        status: "failed",
        last_error_code: error_code,
        updated_at: now
      });
    } else {
      await db.insert("idempotency", {
        key,
        direction,
        status: "failed",
        last_error_code: error_code,
        created_at: now,
        updated_at: now
      });
    }
  }
});
