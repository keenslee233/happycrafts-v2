
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const inventory = await prisma.inventory.findMany();
    console.log('--- INVENTORY ---');
    console.log(JSON.stringify(inventory, null, 2));

    const pricingRules = await prisma.pricingRule.findMany();
    console.log('--- PRICING RULES ---');
    console.log(JSON.stringify(pricingRules, null, 2));

    const sessions = await prisma.session.findMany({ select: { shop: true, role: true } });
    console.log('--- SESSIONS ---');
    console.log(JSON.stringify(sessions, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
