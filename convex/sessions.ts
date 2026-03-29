import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const storeSession = mutation({
  args: {
    id: v.string(),
    shop: v.string(),
    state: v.string(),
    isOnline: v.boolean(),
    scope: v.optional(v.string()),
    expires: v.optional(v.number()),
    accessToken: v.string(),
    userId: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    accountOwner: v.boolean(),
    locale: v.optional(v.string()),
    collaborator: v.optional(v.boolean()),
    emailVerified: v.optional(v.boolean()),
    refreshToken: v.optional(v.string()),
    refreshTokenExpires: v.optional(v.number()),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("id", args.id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("sessions", args);
    }
  },
});

export const loadSession = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("id", args.id))
      .unique();
  },
});

export const deleteSession = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("id", args.id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const deleteSessions = mutation({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, args) => {
    for (const id of args.ids) {
      const existing = await ctx.db
        .query("sessions")
        .withIndex("by_sessionId", (q) => q.eq("id", id))
        .unique();
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    }
  },
});

export const findSessionsByShop = query({
  args: { shop: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .collect();
  },
});

export const findSessionByRole = query({
  args: { role: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("role"), args.role))
      .first();
  },
});

export const findSessionByShopAndRole = query({
  args: { shop: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_shop", (q) => q.eq("shop", args.shop))
      .filter((q) => q.eq(q.field("role"), args.role))
      .first();
  },
});

export const findSessionsByRole = query({
  args: { role: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("role"), args.role))
      .collect();
  },
});
export const findAllSessions = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("sessions").collect();
  },
});
