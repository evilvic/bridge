import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getActive = query({
  args: {},
  handler: async ({ db }) => {
    const configs = await db.query("routing_configs").collect();
    if (configs.length === 0) return null;
    const enabled = configs.find((config) => config.enabled);
    return enabled ?? configs[0];
  }
});

export const upsert = mutation({
  args: {
    number_to: v.string(),
    intercom_workspace_id: v.string(),
    enabled: v.boolean(),
    created_at: v.string(),
    updated_at: v.string()
  },
  handler: async ({ db }, args) => {
    const now = new Date().toISOString();
    const existing = await db.query("routing_configs").collect();
    if (existing.length > 0) {
      const [primary, ...rest] = existing;
      await db.patch(primary._id, {
        number_to: args.number_to,
        intercom_workspace_id: args.intercom_workspace_id,
        enabled: args.enabled,
        updated_at: now
      });
      for (const extra of rest) {
        await db.delete(extra._id);
      }
      return {
        number_to: args.number_to,
        intercom_workspace_id: args.intercom_workspace_id,
        enabled: args.enabled,
        created_at: primary.created_at,
        updated_at: now
      };
    }

    const payload = {
      number_to: args.number_to,
      intercom_workspace_id: args.intercom_workspace_id,
      enabled: args.enabled,
      created_at: now,
      updated_at: now
    };
    await db.insert("routing_configs", payload);
    return payload;
  }
});
