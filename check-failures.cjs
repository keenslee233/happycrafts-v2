const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function checkFailures() {
    try {
        const logs = await db.syncLog.findMany({
            where: {
                OR: [
                    { sku: 'ORDER_FORWARD' },
                    { status: 'FAILED' }
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        console.log('FAILURE_CHECK_RESULT:', JSON.stringify(logs));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.$disconnect();
    }
}

checkFailures();
