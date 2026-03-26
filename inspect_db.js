import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function main() {
    const inventory = await client.query(api.inventory.listInventory, {});
    console.log('--- INVENTORY ---');
    console.log(JSON.stringify(inventory, null, 2));

    const pricingRules = await client.query(api.pricing.getPricingRule, { shop: "" }); // Needs correction if we want all
    console.log('--- PRICING RULES ---');
    console.log(JSON.stringify(pricingRules, null, 2));

    const sessions = await client.query(api.sessions.findSessionsByShop, { shop: "" });
    console.log('--- SESSIONS ---');
    console.log(JSON.stringify(sessions, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(() => process.exit(0));
