import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

console.log("Diagnostic: Environment keys available:", Object.keys(process.env).filter(k => k.includes("SHOPIFY") || k.includes("CONVEX")));

if (!process.env.CONVEX_URL) {
  throw new Error("CRITICAL: CONVEX_URL is not set in environment variables.");
}

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

export { convex, api };
export default convex;
