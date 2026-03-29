import "dotenv/config";
import { convex, api } from "./app/db.server.js";

async function run() {
  const SkuToImport = "002"; // Example SKU, I will need to find a real SKU from the user's DB
  
  const inventoryItem = await convex.query(api.inventory.getInventoryBySku, { sku: SkuToImport });
  console.log("Inventory Item:", inventoryItem);

}
run();
