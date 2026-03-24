import { createAdminApiClient } from "@shopify/admin-api-client";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function run() {
    const wholesaleSession = await db.session.findFirst({ where: { role: "WHOLESALE" } });
    if (!wholesaleSession) return console.log("No wholesale session");

    const client = createAdminApiClient({
        storeDomain: wholesaleSession.shop,
        apiVersion: "2026-01",
        accessToken: wholesaleSession.accessToken,
    });

    const query = `
        query {
            draftOrders(first: 5, reverse: true) {
                nodes {
                    id
                    name
                    note
                    totalPriceSet {
                        presentmentMoney {
                            amount
                            currencyCode
                        }
                    }
                    lineItems(first: 5) {
                        nodes {
                            title
                            quantity
                            sku
                        }
                    }
                }
            }
        }
    `;

    const response = await client.request(query);
    const draftOrders = response.data?.draftOrders?.nodes || [];

    console.log(`\n📦 Recent Draft Orders on Master (${wholesaleSession.shop}):`);
    draftOrders.forEach(order => {
        console.log(`\n  --- ${order.name} (${order.id}) ---`);
        console.log(`  Note:  ${order.note}`);
        console.log(`  Total: ${order.totalPriceSet?.presentmentMoney?.amount} ${order.totalPriceSet?.presentmentMoney?.currencyCode}`);
        order.lineItems.nodes.forEach(item => {
            console.log(`    → ${item.title} (SKU: ${item.sku}) x ${item.quantity}`);
        });
    });
}

run().catch(console.error).finally(() => process.exit(0));
