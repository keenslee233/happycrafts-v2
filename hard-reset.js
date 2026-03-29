import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);
const TARGET_SKU_PART = "1221";

async function hardReset() {
    console.log("🚀 Starting HARD RESET for Demo cleanup...\n");

    // 1. WIPE CONVEX
    console.log("--- Clearing Convex Collections ---");
    try {
        await client.mutation(api.inventory.deleteAllInventory, {});
        console.log("✅ Wiped 'inventory' collecton");
        
        await client.mutation(api.productMappings.deleteAllMappings, {});
        console.log("✅ Wiped 'productMappings' collection");
        
        await client.mutation(api.orders.deleteAllOrders, {});
        console.log("✅ Wiped 'pushedOrders' collection");
        
        await client.mutation(api.syncLogs.deleteAllLogs, {});
        console.log("✅ Wiped 'syncLogs' collection");
    } catch (e) {
        console.error("❌ Error wiping Convex:", e.message);
    }

    // 2. SHOPIFY CLEANUP
    console.log("\n--- Clearing Shopify Stores ---");
    const sessions = await client.query(api.sessions.findAllSessions, {});
    
    // Group by shop to avoid double-processing if there are multiple sessions per shop
    const uniqueShops = [...new Set(sessions.map(s => s.shop))];
    
    for (const shop of uniqueShops) {
        const session = sessions.find(s => s.shop === shop);
        if (!session || !session.accessToken) continue;

        console.log(`\n📦 Processing Store: ${shop}`);
        
        const shopify = createAdminApiClient({
            storeDomain: shop,
            apiVersion: "2026-01",
            accessToken: session.accessToken,
        });

        // 2a. Delete products with synced SKUs
        try {
            console.log(`Searching for products with SKU part: "${TARGET_SKU_PART}"...`);
            const productQuery = `
                query getProducts($query: String!) {
                    products(first: 50, query: $query) {
                        nodes {
                            id
                            title
                            variants(first: 10) {
                                nodes {
                                    id
                                    sku
                                }
                            }
                        }
                    }
                }
            `;
            
            const response = await shopify.request(productQuery, {
                variables: { query: `sku:*${TARGET_SKU_PART}*` }
            });

            const products = response.data?.products?.nodes || [];
            console.log(`Found ${products.length} products to delete.`);

            for (const product of products) {
                console.log(`Deleting product: ${product.title} (${product.id})`);
                const deleteMutation = `
                    mutation productDelete($input: ProductDeleteInput!) {
                        productDelete(input: $input) {
                            deletedProductId
                            userErrors { field message }
                        }
                    }
                `;
                await shopify.request(deleteMutation, {
                    variables: { input: { id: product.id } }
                });
            }
        } catch (e) {
            console.error(`❌ Error deleting products in ${shop}:`, e.message);
        }

        // 2b. Reset Inventory in "Happycrafts-Sync" location
        try {
            console.log("Finding fulfillment location...");
            const locQuery = `
                query getLocations {
                    locations(first: 50) {
                        nodes {
                            id
                            name
                        }
                    }
                }
            `;
            const locResponse = await shopify.request(locQuery);
            const locations = locResponse.data?.locations?.nodes || [];
            
            const targetLoc = locations.find(l => 
                l.name === "Happycrafts-Sync" || 
                l.name === "Happycrafts-Fulfillment"
            );

            if (targetLoc) {
                console.log(`Found location "${targetLoc.name}" (${targetLoc.id}). Resetting inventory...`);
                
                // Fetch inventory levels at this location
                const invQuery = `
                    query getInventoryLevels($locationId: ID!) {
                        location(id: $locationId) {
                            inventoryLevels(first: 100) {
                                nodes {
                                    id
                                    quantities(names: ["available"]) {
                                        name
                                        quantity
                                    }
                                    inventoryItem {
                                        id
                                    }
                                }
                            }
                        }
                    }
                `;
                
                const invResponse = await shopify.request(invQuery, {
                    variables: { locationId: targetLoc.id }
                });
                
                const levels = invResponse.data?.location?.inventoryLevels?.nodes || [];
                console.log(`Found ${levels.length} inventory items at location. Zeroing them out...`);

                for (const level of levels) {
                    const currentQty = level.quantities[0]?.quantity || 0;
                    if (currentQty === 0) continue;

                    const setMutation = `
                        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
                            inventorySetQuantities(input: $input) {
                                inventoryLevels {
                                    id
                                    available
                                }
                                userErrors { field message }
                            }
                        }
                    `;
                    
                    await shopify.request(setMutation, {
                        variables: {
                            input: {
                                reason: "correction",
                                name: "available",
                                ignoreInactiveStockholds: true,
                                quantities: [{
                                    inventoryItemId: level.inventoryItem.id,
                                    locationId: targetLoc.id,
                                    quantity: 0
                                }]
                            }
                        }
                    });
                }
                console.log("✅ Inventory reset complete for this location.");
            } else {
                console.log("⚠️ No 'Happycrafts-Sync' or 'Happycrafts-Fulfillment' location found in this store.");
            }
        } catch (e) {
            console.error(`❌ Error resetting inventory in ${shop}:`, e.message);
        }
    }

    console.log("\n✨ HARD RESET COMPLETE ✨");
}

hardReset().catch(e => {
    console.error("FATAL ERROR during hard reset:", e);
    process.exit(1);
});
