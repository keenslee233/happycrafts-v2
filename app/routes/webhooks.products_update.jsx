import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import { updateRetailInventory } from "../utils/retailSync.server.js";
import convex from "../db.server";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
  );

  if (!admin) {
    console.warn("⚠️ No admin context - proceeding with local DB sync only (or broadcast attempt)");
  }

  // Retrieve the session to find the role
  const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop });
  const shopSession = shopSessions[0];

  const role = shopSession?.role;
  console.log(`🔔 Webhook received for ${shop}. Role: ${role}`);

  // The topics handled here should be declared in the shopify.app.toml.
  switch (topic.trim()) {
    case "PRODUCTS_UPDATE":
    case "products/update":

      if (payload.variants) {
        for (const variant of payload.variants) {
          if (variant.sku) {
            // 1. Update Local Inventory
            const inv = await convex.query(api.inventory.getInventoryBySku, { sku: variant.sku });
            await convex.mutation(api.inventory.upsertInventory, {
              sku: variant.sku,
              productName: payload.title,
              stockLevel: variant.inventory_quantity,
              quantity: variant.inventory_quantity,
              masterStoreId: inv?.masterStoreId,
              masterCostPrice: inv?.masterCostPrice,
              retailProductId: inv?.retailProductId
            });

            // Log Local Sync
            try {
              await convex.mutation(api.syncLogs.createLog, {
                shop: shop,
                sku: variant.sku,
                status: "SUCCESS",
                message: `Updated local inventory to ${variant.inventory_quantity}`,
                createdAt: Date.now()
              });
            } catch (e) {
              console.error("Failed to write to SyncLog:", e);
            }

            console.log(`✅ Convex Sync Success for SKU: ${variant.sku}`);

            // 2. Broadcast if WHOLESALE
            if (role === "WHOLESALE") {
              console.log(`📡 Initiating Broadcast for SKU ${variant.sku}...`);

              const retailPartners = await convex.query(api.sessions.findSessionsByRole, {
                role: "RETAIL"
              });

              console.log(`📡 Found ${retailPartners.length} Retail Partners.`);

              for (const partner of retailPartners) {
                // Skip self
                if (partner.shop === shop) continue;

                console.log(`🚀 Sending update to partner: ${partner.shop}`);
                await updateRetailInventory(partner.shop, partner.accessToken, variant.sku, variant.inventory_quantity);

                // Log Broadcast
                try {
                  await convex.mutation(api.syncLogs.createLog, {
                    shop: shop,
                    sku: variant.sku,
                    status: "BROADCAST",
                    message: `Sent update to Retail Partner: ${partner.shop}`,
                    createdAt: Date.now()
                  });
                } catch (e) {
                  console.error("Failed to write Broadcast Log:", e);
                }
              }
            } else {
              console.log("ℹ️ Not broadcasting (Sender is not Wholesale Master).");
            }
          }
        }
      }
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
    case "SHOP_REDACT":
      break;

    default:
      console.warn(`⚠️ Unhandled topic: ${topic}`);
      throw new Response("Unhandled webhook topic", { status: 404 });
  }

  throw new Response();
};

