import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPricingRule = query({
  args: { shop: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pricingRules")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .unique();
  },
});

export const getPricingRuleByShop = getPricingRule;

export const upsertPricingRule = mutation({
  args: {
    shop: v.string(),
    enabled: v.boolean(),
    mode: v.string(),
    value: v.float64(),
    rounding: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pricingRules")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("pricingRules", args);
    }
  },
});
