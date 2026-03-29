import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  try {
    console.log("Running backfillQuantity calculation...");
    const result = await client.mutation(api.migrations.backfillQuantity);
    console.log("Backfill result:", result);
  } catch (e) {
    console.error("Backfill failed:", e.message);
  }
}

run();
