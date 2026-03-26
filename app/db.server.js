import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";



if (!process.env.CONVEX_URL) {
  const msg = "CRITICAL: CONVEX_URL is not set in environment variables.";
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  } else {
    console.warn(msg);
  }
}

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

export { convex, api };
export default convex;
