import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listInventory = query({
  args: { shop: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.query("inventory").collect();
  },
});

export const listPublicInventory = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("inventory").filter(q => q.eq(q.field("isPublic"), true)).collect();
  },
});

export const getInventoryBySku = query({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();
  },
});

export const upsertInventory = mutation({
  args: {
    sku: v.string(),
    productName: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    stockLevel: v.float64(),
    quantity: v.float64(),
    retailProductId: v.optional(v.string()),
    masterStoreId: v.optional(v.string()),
    masterCostPrice: v.optional(v.float64()),
    isListed: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { isListed = false, isPublic = false, ...other } = args;
    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();

    const data = { 
      ...other, 
      isListed, 
      isPublic, 
      quantity: args.quantity
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("inventory", data);
    }
  },
});

export const deleteInventory = mutation({
  args: { sku: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("inventory")
      .withIndex("by_sku", (q) => q.eq("sku", args.sku))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const deleteAllInventory = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("inventory").collect();
    for (const item of all) {
      await ctx.db.delete(item._id);
    }
  },
});

