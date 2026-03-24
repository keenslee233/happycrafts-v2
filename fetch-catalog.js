import { createAdminApiClient } from "@shopify/admin-api-client";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * Fetches all products from the Wholesale Master store and populates
 * the Prisma Inventory table. This restores the dashboard catalog
 * without needing webhook triggers.
 */
async function fetchCatalog() {
    const wholesaleSession = await db.session.findFirst({
        where: { role: 'WHOLESALE' }
    });

    if (!wholesaleSession) {
        console.log("❌ No WHOLESALE session found.");
        return;
    }

    console.log(`\n📦 Fetching catalog from Master: ${wholesaleSession.shop}\n`);

    const client = createAdminApiClient({
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

        const response = await client.request(query, {
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

                await db.inventory.upsert({
                    where: { sku: variant.sku },
                    update: {
                        productName: product.title,
                        stockLevel: variant.inventoryQuantity || 0,
                    },
                    create: {
                        sku: variant.sku,
                        productName: product.title,
                        stockLevel: variant.inventoryQuantity || 0,
                    }
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
    const inventory = await db.inventory.findMany({ orderBy: { sku: 'asc' } });
    console.log("Current Inventory Table:");
    for (const item of inventory) {
        console.log(`  ${item.sku} — ${item.productName} (Stock: ${item.stockLevel})`);
    }
}

fetchCatalog()
    .catch(console.error)
    .finally(() => process.exit(0));
