import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: { shop: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("importList")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    shop: v.string(),
    sku: v.string(),
    productName: v.string(),
    imageUrl: v.optional(v.string()),
    masterCostPrice: v.optional(v.float64()),
    masterStoreId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if the item is already in the list
    const existing = await ctx.db
      .query("importList")
      .withIndex("by_shop_sku", (q) => q.eq("shop", args.shop).eq("sku", args.sku))
      .unique();

    if (existing) {
      return existing._id;
    }

    // Insert new item
    const newItem = {
      ...args,
      createdAt: Date.now(),
    };
    return await ctx.db.insert("importList", newItem);
  },
});

export const remove = mutation({
  args: { shop: v.string(), sku: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("importList")
      .withIndex("by_shop_sku", (q) => q.eq("shop", args.shop).eq("sku", args.sku))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  },
});

export const deleteAllImportList = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("importList").collect();
    for (const doc of all) {
      await ctx.db.delete(doc._id);
    }
    return true;
  },
});
