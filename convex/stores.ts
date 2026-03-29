import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Upserts a store's configuration, including the fulfillment location ID.
 */
export const upsertStore = mutation({
  args: {
    shop: v.string(),
    locationId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stores")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .unique();

    const data = {
      ...args,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("stores", data);
    }
    
    console.log(`[convex/stores.ts] Upserted store config for ${args.shop}: locationId=${args.locationId}`);
    return { success: true };
  },
});

/**
 * Retrieves a store's configuration by shop name.
 */
export const getStoreByShop = query({
  args: { shop: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stores")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .unique();
  },
});
