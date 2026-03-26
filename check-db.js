import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function check() {
    console.log('--- PRODUCT MAPPINGS ---');
    const mappings = await client.query(api.productMappings.listMappings, {});
    console.log(JSON.stringify(mappings, null, 2));

    console.log('\n--- INVENTORY ---');
    const inventory = await client.query(api.inventory.listInventory, {});
    console.log(JSON.stringify(inventory, null, 2));

    console.log('\n--- RECENT LOGS ---');
    const logs = await client.query(api.syncLogs.listLogs, {});
    console.log(JSON.stringify(logs, null, 2));

    console.log('\n--- SESSIONS ---');
    // Using a simple list all sessions if we had one, but we have findSessionsByShop.
    // Let's assume we can list all or just report progress.
    const sessions = await client.query(api.sessions.findSessionsByShop, { shop: "" }); // This might need a listAll
    console.log(JSON.stringify(sessions, null, 2));

    process.exit(0);
}

check().catch(e => {
    console.error(e);
    process.exit(1);
});
