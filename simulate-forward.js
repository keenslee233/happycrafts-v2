import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function simulateForward(sku) {
    try {
        console.log(`\n--- SIMULATING FORWARD FOR SKU: ${sku} ---`);

        // 1. Find product in Inventory
        const inventoryItem = await client.query(api.inventory.getInventoryBySku, { sku });

        if (!inventoryItem) {
            console.error(`❌ SKU ${sku} not found in Inventory.`);
            return;
        }

        console.log(`✓ Matched SKU ${sku}: "${inventoryItem.productName}"`);
        console.log(`✓ Master Store: ${inventoryItem.masterStoreId}`);

        // 2. Find Wholesale session
        const wholesaleSession = await client.query(api.sessions.findSessionByShopAndRole, {
            shop: inventoryItem.masterStoreId || "",
            role: "WHOLESALE"
        });

        if (!wholesaleSession) {
            console.error(`❌ No WHOLESALE session found for ${inventoryItem.masterStoreId}.`);
            return;
        }

        // 3. Prepare Draft Order
        const draftLineItems = [{
            title: `${inventoryItem.productName} (SKU: ${sku})`,
            quantity: 1,
            originalUnitPrice: (inventoryItem.masterCostPrice || 0).toFixed(2),
        }];

        const draftOrderInput = {
            note: `🔄 MANUAL SIMULATION\nRetail Shop: happycrafts-retail.myshopify.com\nSKU: ${sku}`,
            email: "test@example.com",
            lineItems: draftLineItems,
        };

        console.log(`\n📤 Creating Draft Order on Master (${wholesaleSession.shop})...`);
        const masterClient = createAdminApiClient({
            storeDomain: wholesaleSession.shop,
            apiVersion: "2026-01",
            accessToken: wholesaleSession.accessToken,
        });

        const response = await masterClient.request(`
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id name }
          userErrors { field message }
        }
      }
    `, { variables: { input: draftOrderInput } });

        const draftOrder = response.data?.draftOrderCreate?.draftOrder;
        const userErrors = response.data?.draftOrderCreate?.userErrors;

        if (userErrors?.length > 0) {
            console.error("❌ Draft Order userErrors:", JSON.stringify(userErrors, null, 2));
        } else if (draftOrder) {
            console.log(`\n✅ SUCCESS! Draft Order created: ${draftOrder.name} (${draftOrder.id})`);

            // Log to SyncLog
            await client.mutation(api.syncLogs.createLog, {
                shop: "happycrafts-retail.myshopify.com",
                sku: sku,
                status: "BROADCAST",
                message: `SIMULATION SUCCESS: SKU ${sku} forwarded to ${wholesaleSession.shop}`,
                createdAt: Date.now()
            });
            console.log("✓ Record created in syncLogs table");
        }

    } catch (error) {
        console.error('❌ Exception:', error.message);
    } finally {
        process.exit(0);
    }
}

simulateForward('1263');
