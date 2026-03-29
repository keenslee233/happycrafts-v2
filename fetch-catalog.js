import { createAdminApiClient } from "@shopify/admin-api-client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function fetchCatalog() {
    const wholesaleSession = await client.query(api.sessions.findSessionByRole, { role: 'WHOLESALE' });

    if (!wholesaleSession) {
        console.log("❌ No WHOLESALE session found.");
        return;
    }

    console.log(`\n📦 Fetching catalog from Master: ${wholesaleSession.shop}\n`);

    const shopifyClient = createAdminApiClient({
        storeDomain: wholesaleSession.shop,
        apiVersion: "2026-01",
        accessToken: wholesaleSession.accessToken,
    });

    // Fetch all products with variants
    let hasNextPage = true;
    let cursor = null;
    let totalProducts = 0;
    let totalVariants = 0;

    while (hasNextPage) {
        const query = `
      query getProducts($after: String) {
        products(first: 50, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            title
            variants(first: 10) {
              nodes {
                sku
                price
                inventoryQuantity
              }
            }
          }
        }
      }
    `;

        const response = await shopifyClient.request(query, {
            variables: { after: cursor }
        });

        const products = response.data?.products;
        if (!products) {
            console.log("❌ Failed to fetch products");
            break;
        }

        for (const product of products.nodes) {
            totalProducts++;
            for (const variant of product.variants.nodes) {
                if (!variant.sku) {
                    console.log(`  ⚠️ Skipping "${product.title}" variant (no SKU)`);
                    continue;
                }

                await client.mutation(api.inventory.upsertInventory, {
                    sku: variant.sku,
                    productName: product.title,
                    stockLevel: variant.inventoryQuantity || 0,
                    quantity: variant.inventoryQuantity || 0,
                    isListed: false,
                    isPublic: false,
                });

                totalVariants++;
                console.log(`  ✓ ${variant.sku} — "${product.title}" (Stock: ${variant.inventoryQuantity}, Price: $${variant.price})`);
            }
        }

        hasNextPage = products.pageInfo.hasNextPage;
        cursor = products.pageInfo.endCursor;
    }

    console.log(`\n════════════════════════════════════════`);
    console.log(`  Catalog Sync Complete`);
    console.log(`  Products scanned: ${totalProducts}`);
    console.log(`  Variants with SKUs: ${totalVariants}`);
    console.log(`════════════════════════════════════════\n`);

    // Show final inventory
    const inventory = await client.query(api.inventory.listInventory, {});
    console.log("Current Inventory Table:");
    for (const item of inventory) {
        console.log(`  ${item.sku} — ${item.productName} (Stock: ${item.stockLevel})`);
    }
}

fetchCatalog()
    .catch(console.error)
    .finally(() => process.exit(0));
