const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function checkSku(sku) {
    try {
        const item = await db.inventory.findUnique({
            where: { sku: sku }
        });
        console.log('SKU_CHECK_RESULT:', JSON.stringify(item));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.$disconnect();
    }
}

checkSku('1263');
