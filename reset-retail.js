import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

/**
 * Cleanup script: Deletes all ProductMapping, Inventory, and SyncLog
 * records for the retail store ONLY. Does NOT touch wholesale/session data.
 *
 * Usage: node reset-retail.js [shop]
 * Default shop: happycrafts-retail.myshopify.com
 */
async function resetRetail() {
    const shop = process.argv[2] || 'happycrafts-retail.myshopify.com';
    console.log(`\n🔄 Resetting retail state for: ${shop}\n`);

    // 1. Delete ProductMappings for this retail shop only
    const mappingResult = await db.productMapping.deleteMany({
        where: { retailShop: shop }
    });
    console.log(`✓ Deleted ${mappingResult.count} ProductMapping record(s)`);

    // 2. Delete Inventory records (these are shared, but seeded from wholesale)
    //    We clear them so the next import re-creates them fresh with retailProductId
    const inventoryResult = await db.inventory.deleteMany({});
    console.log(`✓ Deleted ${inventoryResult.count} Inventory record(s)`);

    // 3. Delete SyncLogs for this shop
    const logResult = await db.syncLog.deleteMany({
        where: { shop: shop }
    });
    console.log(`✓ Deleted ${logResult.count} SyncLog record(s)`);

    // Verify
    console.log('\n--- Verification ---');
    const remainingMappings = await db.productMapping.count();
    const remainingInventory = await db.inventory.count();
    const remainingSyncLogs = await db.syncLog.count({ where: { shop } });
    console.log(`ProductMappings remaining: ${remainingMappings}`);
    console.log(`Inventory remaining: ${remainingInventory}`);
    console.log(`SyncLogs remaining (for ${shop}): ${remainingSyncLogs}`);

    // Show untouched sessions
    const sessions = await db.session.findMany({ select: { shop: true, role: true } });
    console.log('\n--- Sessions (untouched) ---');
    sessions.forEach(s => console.log(`  ${s.role || 'NO ROLE'}: ${s.shop}`));

    console.log('\n✅ Reset complete! Dashboard should now show 0 synced products.');
    console.log('   Import buttons will be active again.\n');
}

resetRetail()
    .catch(console.error)
    .finally(() => process.exit(0));
