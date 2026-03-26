import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listOrders = query({
  args: { shop: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { shop } = args;
    if (shop) {
      return await ctx.db
        .query("pushedOrders")
        .withIndex("by_shop", (q) => q.eq("shop", shop))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("pushedOrders").order("desc").collect();
  },
});

export const listOrdersByMaster = query({
  args: { masterStoreId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushedOrders")
      .withIndex("by_masterStoreId", (q) => q.eq("masterStoreId", args.masterStoreId))
      .order("desc")
      .collect();
  },
});

export const getOrderByRetailId = query({
  args: { retailOrderId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushedOrders")
      .withIndex("by_retailOrderId", (q) => q.eq("retailOrderId", args.retailOrderId))
      .unique();
  },
});

export const createOrder = mutation({
  args: {
    retailOrderId: v.string(),
    masterDraftOrderId: v.string(),
    shop: v.string(),
    masterStoreId: v.optional(v.string()),
    totalItems: v.float64(),
    totalAmount: v.float64(),
    customerEmail: v.optional(v.string()),
    shippingCity: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("pushedOrders", args);
  },
});
