import { authenticate } from "../shopify.server";
import db from "../db.server";
import { updateRetailInventory } from "../utils/retailSync.server.js";

export const action = async ({ request }) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(
    request
  );

  if (!admin) {
    console.warn("⚠️ No admin context - proceeding with local DB sync only (or broadcast attempt)");
  }

  // Retrieve the session to find the role
  const shopSession = await db.session.findFirst({
    where: { shop: shop }
  });

  const role = shopSession?.role;
  console.log(`🔔 Webhook received for ${shop}. Role: ${role}`);

  // The topics handled here should be declared in the shopify.app.toml.
  switch (topic.trim()) {
    case "PRODUCTS_UPDATE":
    case "products/update":

      // LOGIC:
      // 1. Always update local inventory (so we have a record).
      // 2. IF valid role = WHOLESALE, broadcast to Retailers.

      if (payload.variants) {
        for (const variant of payload.variants) {
          if (variant.sku) {
            // 1. Update Local Inventory
            await db.inventory.upsert({
              where: { sku: variant.sku },
              update: {
                productName: payload.title,
                stockLevel: variant.inventory_quantity
              },
              create: {
                sku: variant.sku,
                productName: payload.title,
                stockLevel: variant.inventory_quantity
              }
            });

            // Log Local Sync
            try {
              await db.syncLog.create({
                data: {
                  shop: shop,
                  sku: variant.sku,
                  status: "SUCCESS",
                  message: `Updated local inventory to ${variant.inventory_quantity}`,
                }
              });
            } catch (e) {
              console.error("Failed to write to SyncLog:", e);
            }

            console.log(`✅ Prisma Sync Success for SKU: ${variant.sku}`);

            // 2. Broadcast if WHOLESALE
            if (role === "WHOLESALE") {
              console.log(`📡 Initiating Broadcast for SKU ${variant.sku}...`);

              const retailPartners = await db.session.findMany({
                where: { role: "RETAIL" }
              });

              console.log(`📡 Found ${retailPartners.length} Retail Partners.`);

              for (const partner of retailPartners) {
                // Skip self
                if (partner.shop === shop) continue;

                console.log(`🚀 Sending update to partner: ${partner.shop}`);
                await updateRetailInventory(partner.shop, partner.accessToken, variant.sku, variant.inventory_quantity);

                // Log Broadcast
                try {
                  await db.syncLog.create({
                    data: {
                      shop: shop,
                      sku: variant.sku,
                      status: "BROADCAST",
                      message: `Sent update to Retail Partner: ${partner.shop}`,
                    }
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
