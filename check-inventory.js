import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  const inventory = await client.query(api.inventory.listInventory, {});
  console.log("Inventory Items:");
  inventory.forEach(item => {
    console.log(`SKU: ${item.sku} | Master Store: ${item.masterStoreId} | Name: ${item.productName}`);
  });
}

run().catch(console.error).finally(() => process.exit(0));
