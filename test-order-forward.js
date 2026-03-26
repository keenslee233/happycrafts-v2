import { createAdminApiClient } from "@shopify/admin-api-client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

/**
 * Simulates the order forwarding flow by directly calling the
 * same logic as webhooks.orders_create.jsx.
 * Tests: SKU matching → Master Cost lookup → draftOrderCreate → Convex logging
 */
async function run() {
    const retailShop = 'happycrafts-retail.myshopify.com';

    // Simulate an order payload from the Retail store
    const fakeOrder = {
        name: "#TEST-001",
        email: "testcustomer@example.com",
        shipping_address: {
            first_name: "Test",
            last_name: "Customer",
            address1: "123 Test Street",
            address2: "Apt 4B",
            city: "Toronto",
            province: "Ontario",
            country: "CA",
            zip: "M5V 1A1",
            phone: "+1-416-555-0100",
        },
        line_items: [
            { sku: "1221", quantity: 1, price: "62.99", title: "Selling Plans Ski Wax" },
        ],
    };

    console.log(`\n📦 Simulating order ${fakeOrder.name} from ${retailShop}\n`);

    // ── Step 1: Match SKUs ──
    const matchedItems = [];
    for (const item of fakeOrder.line_items) {
        const inv = await client.query(api.inventory.getInventoryBySku, { sku: item.sku });
        if (inv) {
            console.log(`  ✓ Matched: SKU ${item.sku} — "${inv.productName}"`);
            matchedItems.push({
                sku: item.sku,
                title: inv.productName,
                quantity: item.quantity,
                masterCostPrice: inv.masterCostPrice || 0,
                masterStoreId: inv.masterStoreId
            });
        } else {
            console.log(`  ✗ SKU ${item.sku} not in Inventory`);
        }
    }

    if (matchedItems.length === 0) return console.log("❌ No matches");

    // ── Step 2: Prepare Draft Order Data ──
    const wholesaleSession = await client.query(api.sessions.findSessionByRole, { role: "WHOLESALE" });
    if (!wholesaleSession) return console.log("❌ No wholesale session");

    const draftLineItems = matchedItems.map(item => ({
        title: `${item.title} (SKU: ${item.sku})`,
        quantity: item.quantity,
        originalUnitPrice: item.masterCostPrice.toFixed(2),
    }));

    const totalAmount = matchedItems.reduce((sum, item) => sum + (item.masterCostPrice * item.quantity), 0);

    console.log(`  💰 Calculated Total Wholesale Cost: $${totalAmount.toFixed(2)}`);

    // ── Step 3: Create Draft Order (Mocked API call if token is fake) ──
    console.log(`\n📤 Creating Draft Order on ${wholesaleSession.shop}...`);

    const masterClient = createAdminApiClient({
        storeDomain: wholesaleSession.shop,
        apiVersion: "2026-01",
        accessToken: wholesaleSession.accessToken,
    });

    try {
        const response = await masterClient.request(`
            mutation draftOrderCreate($input: DraftOrderInput!) {
                draftOrderCreate(input: $input) {
                    draftOrder { id name }
                    userErrors { field message }
                }
            }
        `, {
            variables: {
                input: {
                    note: `🔄 Forwarded from Retail: ${retailShop}\nRetail Order: ${fakeOrder.name}\nCustomer: ${fakeOrder.email}`,
                    email: fakeOrder.email,
                    lineItems: draftLineItems,
                }
            }
        });

        const draftOrder = response.data?.draftOrderCreate?.draftOrder;
        const userErrors = response.data?.draftOrderCreate?.userErrors;

        if (userErrors?.length > 0) {
            console.log("\n❌ Draft Order userErrors:", JSON.stringify(userErrors, null, 2));
        } else if (draftOrder || wholesaleSession.accessToken.startsWith('shpat_fake')) {
            // If it's a fake token, we simulate success for the sake of testing
            const mockDraftOrder = draftOrder || { id: "gid://shopify/DraftOrder/12345", name: "#DRAFT-123" };

            console.log(`\n✅ Mocking/Real Success: ${mockDraftOrder.name}`);

            // ── Step 4: Log to PushedOrder table ──
            await client.mutation(api.orders.createOrder, {
                retailOrderId: "123456789", // fake external ID
                masterDraftOrderId: mockDraftOrder.id,
                shop: retailShop,
                totalItems: matchedItems.reduce((s, i) => s + i.quantity, 0),
                totalAmount: totalAmount,
                createdAt: Date.now()
            });
            console.log("✓ Record created in pokedOrders table");

            // Log to SyncLog for Recent Activity
            await client.mutation(api.syncLogs.createLog, {
                shop: retailShop, 
                sku: "ORDER_FORWARD", 
                status: "BROADCAST",
                message: `Order ${fakeOrder.name} → Draft ${mockDraftOrder.name} (${matchedItems.length} item(s))`,
                createdAt: Date.now()
            });
            console.log("✓ Record created in syncLogs table");
        }
    } catch (e) {
        console.error("\n❌ API Exception (Expected if token is fake):", e.message);
    }
}

// Wrap console.log to collect logs
const logs = [];
const originalLog = console.log;
console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
};
const originalError = console.error;
console.error = (...args) => {
    logs.push('[ERROR] ' + args.join(' '));
    originalError(...args);
};

run().then(() => {
    import('fs').then(fs => {
        fs.writeFileSync('test-forward-results.log', logs.join('\n'), 'utf8');
        process.exit(0);
    });
}).catch(e => {
    import('fs').then(fs => {
        fs.writeFileSync('test-forward-results.log', e.stack, 'utf8');
        process.exit(1);
    });
});
