import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listLogs = query({
  args: { shop: v.optional(v.string()), sku: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { shop } = args;
    let logs;
    if (shop) {
      logs = await ctx.db
        .query("syncLogs")
        .withIndex("by_shop", (q) => q.eq("shop", shop))
        .order("desc")
        .collect();
    } else {
      logs = await ctx.db.query("syncLogs").order("desc").collect();
    }

    if (args.sku || args.search) {
      logs = logs.filter(log => {
        const matchesSku = args.sku ? log.sku === args.sku : false;
        const matchesSearch = args.search ? log.message.includes(args.search) : false;
        return matchesSku || matchesSearch;
      });
    }

    return logs.slice(0, 50); // Limit results
  },
});


export const createLog = mutation({
  args: {
    shop: v.string(),
    sku: v.string(),
    status: v.string(),
    message: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncLogs", args);
  },
});

export const deleteLogsByShop = mutation({
  args: { shop: v.string() },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("syncLogs")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .collect();
    for (const log of logs) {
      await ctx.db.delete(log._id);
    }
  },
});

export const deleteAllLogs = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("syncLogs").collect();
    for (const log of all) {
      await ctx.db.delete(log._id);
    }
  },
});
