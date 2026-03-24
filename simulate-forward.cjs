const { PrismaClient } = require('@prisma/client');
const { createAdminApiClient } = require('@shopify/admin-api-client');

const db = new PrismaClient();

async function simulateForward(sku) {
    try {
        console.log(`\n--- SIMULATING FORWARD FOR SKU: ${sku} ---`);

        // 1. Find product in Inventory
        const inventoryItem = await db.inventory.findUnique({
            where: { sku: sku }
        });

        if (!inventoryItem) {
            console.error(`❌ SKU ${sku} not found in Inventory.`);
            return;
        }

        console.log(`✓ Matched SKU ${sku}: "${inventoryItem.productName}"`);
        console.log(`✓ Master Store: ${inventoryItem.masterStoreId}`);

        // 2. Find Wholesale session
        const wholesaleSession = await db.session.findFirst({
            where: { shop: inventoryItem.masterStoreId, role: "WHOLESALE" }
        });

        if (!wholesaleSession) {
            console.error(`❌ No WHOLESALE session found for ${inventoryItem.masterStoreId}.`);
            return;
        }

        // 3. Prepare Draft Order
        const draftLineItems = [{
            title: `${inventoryItem.productName} (SKU: ${sku})`,
            quantity: 1,
            originalUnitPrice: inventoryItem.masterCostPrice.toFixed(2),
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

            // Log to SyncLog for verification in UI
            await db.syncLog.create({
                data: {
                    shop: "happycrafts-retail.myshopify.com",
                    sku: sku,
                    status: "BROADCAST",
                    message: `SIMULATION SUCCESS: SKU ${sku} forwarded to ${wholesaleSession.shop}`,
                }
            });
            console.log("✓ Record created in SyncLog table");
        }

    } catch (error) {
        console.error('❌ Exception:', error.message);
    } finally {
        await db.$disconnect();
    }
}

simulateForward('1263');
