import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function resetRetail() {
    const shop = process.argv[2] || 'happycrafts-retail.myshopify.com';
    console.log(`\n🔄 Resetting retail state for: ${shop}\n`);

    // 1. Delete ProductMappings for this retail shop only
    await client.mutation(api.productMappings.deleteMappingsByShop, { shop });
    console.log(`✓ Requested deletion of ProductMapping records for ${shop}`);

    // 2. Delete Inventory records
    await client.mutation(api.inventory.deleteAllInventory, {});
    console.log(`✓ Requested deletion of all Inventory records`);

    // 3. Delete SyncLogs for this shop
    await client.mutation(api.syncLogs.deleteLogsByShop, { shop });
    console.log(`✓ Requested deletion of SyncLog records for ${shop}`);

    // Verify (Simple check)
    console.log('\n--- Verification ---');
    const mappings = await client.query(api.productMappings.listMappings, { retailShop: shop });
    const inventory = await client.query(api.inventory.listInventory, {});
    const logs = await client.query(api.syncLogs.listLogs, { shop });
    
    console.log(`ProductMappings remaining: ${mappings.length}`);
    console.log(`Inventory remaining: ${inventory.length}`);
    console.log(`SyncLogs remaining (for ${shop}): ${logs.length}`);

    console.log('\n✅ Reset complete! Dashboard should now show 0 synced products.');
    console.log('   Import buttons will be active again.\n');
}

resetRetail()
    .catch(console.error)
    .finally(() => process.exit(0));
