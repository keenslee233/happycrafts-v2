import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

async function check() {
    console.log('--- PRODUCT MAPPINGS ---');
    const mappings = await db.productMapping.findMany();
    console.log(JSON.stringify(mappings, null, 2));

    console.log('\n--- INVENTORY ---');
    const inventory = await db.inventory.findMany();
    console.log(JSON.stringify(inventory, null, 2));

    console.log('\n--- RECENT LOGS ---');
    const logs = await db.syncLog.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
    console.log(JSON.stringify(logs, null, 2));

    console.log('\n--- SESSIONS ---');
    const sessions = await db.session.findMany();
    console.log(JSON.stringify(sessions, null, 2));

    process.exit(0);
}

check().catch(e => {
    console.error(e);
    process.exit(1);
});
