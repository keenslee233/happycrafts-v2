import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { ConvexSessionStorage } from "./convex-session-storage";
import { convex } from "./db.server";

if (!process.env.SHOPIFY_API_KEY) {
  throw new Error("CRITICAL: SHOPIFY_API_KEY is not set in environment variables.");
}
if (!process.env.SHOPIFY_API_SECRET) {
  throw new Error("CRITICAL: SHOPIFY_API_SECRET is not set in environment variables.");
}
if (!process.env.SHOPIFY_APP_URL) {
  throw new Error("CRITICAL: SHOPIFY_APP_URL is not set in environment variables.");
}

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.October24,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new ConvexSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = "2026-01";
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
