import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getByExternal = query({
  args: { workspace_id: v.string(), external_id: v.string() },
  handler: async ({ db }, { workspace_id, external_id }) => {
    return db
      .query("conversations_map")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspace_id", workspace_id).eq("external_id", external_id)
      )
      .first();
  }
});

export const upsert = mutation({
  args: {
    workspace_id: v.string(),
    external_id: v.string(),
    intercom_conversation_id: v.string()
  },
  handler: async ({ db }, args) => {
    const now = new Date().toISOString();
    const existing = await db
      .query("conversations_map")
      .withIndex("by_workspace_external", (q) =>
        q.eq("workspace_id", args.workspace_id).eq("external_id", args.external_id)
      )
      .first();
    if (existing) {
      await db.patch(existing._id, {
        intercom_conversation_id: args.intercom_conversation_id,
        updated_at: now
      });
      return;
    }
    await db.insert("conversations_map", {
      workspace_id: args.workspace_id,
      external_id: args.external_id,
      intercom_conversation_id: args.intercom_conversation_id,
      created_at: now,
      updated_at: now
    });
  }
});
