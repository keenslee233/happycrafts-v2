import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function checkSku(sku) {
    try {
        const item = await client.query(api.inventory.getInventoryBySku, { sku });
        console.log('SKU_CHECK_RESULT:', JSON.stringify(item));
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

checkSku('1263');
