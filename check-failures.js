import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function checkFailures() {
    try {
        const logs = await client.query(api.syncLogs.listLogs, {
            sku: 'ORDER_FORWARD',
            search: 'FAILED'
        });
        console.log('FAILURE_CHECK_RESULT:', JSON.stringify(logs));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

checkFailures();
