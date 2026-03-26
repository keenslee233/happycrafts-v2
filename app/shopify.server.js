import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { ConvexSessionStorage } from "./convex-session-storage";
import { convex } from "./db.server";

const isProd = process.env.NODE_ENV === "production";

if (!process.env.SHOPIFY_API_KEY) {
  const msg = "CRITICAL: SHOPIFY_API_KEY is not set in environment variables.";
  if (isProd) throw new Error(msg);
  else console.warn(msg);
}
if (!process.env.SHOPIFY_API_SECRET) {
  const msg = "CRITICAL: SHOPIFY_API_SECRET is not set in environment variables.";
  if (isProd) throw new Error(msg);
  else console.warn(msg);
}
if (!process.env.SHOPIFY_APP_URL) {
  const msg = "CRITICAL: SHOPIFY_APP_URL is not set in environment variables.";
  if (isProd) throw new Error(msg);
  else console.warn(msg);
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
