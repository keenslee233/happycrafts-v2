import "dotenv/config";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { registerHappycraftsSync } from "../app/utils/fulfillment.server.js";
import { convex, api } from "../app/db.server.js";

/**
 * Script to register "Happycrafts-Sync" fulfillment service for all known shops.
 */
async function run() {
  console.log("🚀 Starting fulfillment service registration...");

  try {
    // 1. Get all unique shop sessions from Convex
    const sessions = await convex.query(api.sessions.findAllSessions, {}); 
    
    if (!sessions || sessions.length === 0) {
      console.log("⚠️ No sessions found in Convex.");
      return;
    }

    console.log(`🔍 Found ${sessions.length} sessions to process.`);

    const processedShops = new Set();

    for (const session of sessions) {
      if (processedShops.has(session.shop)) continue;
      
      console.log(`\n--- Processing Shop: ${session.shop} ---`);
      try {
        const client = createAdminApiClient({
          storeDomain: session.shop,
          apiVersion: "2026-01",
          accessToken: session.accessToken,
        });

        const locationId = await registerHappycraftsSync(client, session.shop);
        console.log(`✅ Success: Registered for ${session.shop}. Location ID: ${locationId}`);
        processedShops.add(session.shop);
      } catch (err) {
        console.error(`❌ Failed for ${session.shop}:`, err.message);
      }
    }

    console.log("\n✨ Registration process complete.");
  } catch (error) {
    console.error("💥 Fatal error during registration:", error.message);
  }
}

run();

