import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function checkLogs(sku) {
    try {
        const logs = await client.query(api.syncLogs.listLogs, {
            sku: sku,
            search: sku
        });
        console.log('LOG_CHECK_RESULT:', JSON.stringify(logs));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

checkLogs('1263');
