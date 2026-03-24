const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function checkLogs(sku) {
    try {
        const logs = await db.syncLog.findMany({
            where: {
                OR: [
                    { sku: sku },
                    { message: { contains: sku } }
                ]
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        console.log('LOG_CHECK_RESULT:', JSON.stringify(logs));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await db.$disconnect();
    }
}

checkLogs('1263');
