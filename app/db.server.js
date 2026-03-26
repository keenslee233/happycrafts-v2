import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

if (!process.env.CONVEX_URL) {
  console.error("CRITICAL: CONVEX_URL is not set in environment variables.");
}

const convex = new ConvexHttpClient(process.env.CONVEX_URL || "https://dummy.convex.cloud");

export { convex, api };
export default convex;
