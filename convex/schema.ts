import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    id: v.string(),
    shop: v.string(),
    state: v.string(),
    isOnline: v.boolean(),
    scope: v.optional(v.string()),
    expires: v.optional(v.number()), // Using timestamp
    accessToken: v.string(),
    userId: v.optional(v.string()), // Storing as string for safety
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
  }).index("by_sessionId", ["id"]).index("by_shop", ["shop"]),

  inventory: defineTable({
    sku: v.string(),
    productName: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    stockLevel: v.float64(),
    quantity: v.optional(v.float64()), // Source of truth sync'd from Master store
    retailProductId: v.optional(v.string()),
    masterStoreId: v.optional(v.string()),
    masterCostPrice: v.optional(v.float64()),
    isListed: v.boolean(),
    isPublic: v.boolean(),
  }).index("by_sku", ["sku"]),

  pushedOrders: defineTable({
    retailOrderId: v.string(),
    masterDraftOrderId: v.string(),
    shop: v.string(),
    masterStoreId: v.optional(v.string()),
    totalItems: v.float64(),
    totalAmount: v.float64(),
    customerEmail: v.optional(v.string()),
    shippingCity: v.optional(v.string()),
    createdAt: v.number(), // timestamp
  }).index("by_retailOrderId", ["retailOrderId"]).index("by_shop", ["shop"]).index("by_masterStoreId", ["masterStoreId"]),

  syncLogs: defineTable({
    shop: v.string(),
    sku: v.string(),
    status: v.string(), // 'SUCCESS', 'FAILED', 'BROADCAST'
    message: v.string(),
    createdAt: v.number(), // timestamp
  }).index("by_shop", ["shop"]).index("by_sku", ["sku"]),

  importList: defineTable({
    shop: v.string(),
    sku: v.string(),
    productName: v.string(),
    imageUrl: v.optional(v.string()),
    masterCostPrice: v.optional(v.float64()),
    masterStoreId: v.optional(v.string()),
    createdAt: v.number(), // timestamp
  }).index("by_shop", ["shop"]).index("by_shop_sku", ["shop", "sku"]),

  productMappings: defineTable({
    masterSku: v.string(),
    retailShop: v.string(),
    retailProductId: v.string(),
    retailVariantId: v.string(),
    retailSku: v.optional(v.string()),
    createdAt: v.number(), // timestamp
  }).index("by_masterSku_retailShop", ["masterSku", "retailShop"]),

  pricingRules: defineTable({
    shop: v.string(),
    enabled: v.boolean(),
    mode: v.string(), // "multiplier" or "fixed"
    value: v.float64(),
    rounding: v.string(), // "none", ".99", ".95", ".00"
  }).index("by_shop", ["shop"]),

  stores: defineTable({
    shop: v.string(),
    locationId: v.string(),
    updatedAt: v.number(),
  }).index("by_shop", ["shop"]),
});

