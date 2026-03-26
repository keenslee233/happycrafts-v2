import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listMappings = query({
  args: { masterSku: v.optional(v.string()), retailShop: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { masterSku, retailShop } = args;
    if (masterSku && retailShop) {
      return await ctx.db
        .query("productMappings")
        .withIndex("by_masterSku_retailShop", (q) => 
          q.eq("masterSku", masterSku).eq("retailShop", retailShop)
        )
        .collect();
    }
    return await ctx.db.query("productMappings").collect();
  },
});

export const upsertMapping = mutation({
  args: {
    masterSku: v.string(),
    retailShop: v.string(),
    retailProductId: v.string(),
    retailVariantId: v.string(),
    retailSku: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productMappings")
      .withIndex("by_masterSku_retailShop", (q) => 
        q.eq("masterSku", args.masterSku).eq("retailShop", args.retailShop)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    } else {
      return await ctx.db.insert("productMappings", args);
    }
  },
});

export const deleteMapping = mutation({
  args: { masterSku: v.string(), retailShop: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productMappings")
      .withIndex("by_masterSku_retailShop", (q) => 
        q.eq("masterSku", args.masterSku).eq("retailShop", args.retailShop)
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const deleteMappingsByShop = mutation({
  args: { shop: v.string() },
  handler: async (ctx, args) => {
    const mappings = await ctx.db
      .query("productMappings")
      .filter((q) => q.eq(q.field("retailShop"), args.shop))
      .collect();
    for (const mapping of mappings) {
      await ctx.db.delete(mapping._id);
    }
  },
});

