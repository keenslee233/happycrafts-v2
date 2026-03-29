
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import * as dotenv from "dotenv";
import { createAdminApiClient } from "@shopify/admin-api-client";

dotenv.config();

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function debugStock() {
  console.log("--- Debugging Master Stock Fetch ---");
  
  const inventory = await client.query(api.inventory.listInventory);
  console.log(`Found ${inventory.length} inventory items.`);
  
  const wholesaleSessions = await client.query(api.sessions.findSessionsByRole, { role: "WHOLESALE" });
  const master = wholesaleSessions[0];
  
  if (!master) {
    console.error("No Wholesale session found!");
    return;
  }
  
  console.log(`Wholesale Shop: ${master.shop}`);
  
  const shopify = createAdminApiClient({
    storeDomain: master.shop,
    apiVersion: "2024-04",
    accessToken: master.accessToken,
  });

  const skuQuery = inventory.map(i => `sku:"${i.sku}"`).join(' OR ');
  console.log(`SKU Query: ${skuQuery}`);

  const query = `
    query getVariantData($query: String!) {
      productVariants(first: 250, query: $query) {
        nodes {
          sku
          inventoryQuantity
        }
      }
    }
  `;

  try {
    const response = await shopify.request(query, { variables: { query: skuQuery } });
    const variants = response.data?.productVariants?.nodes || [];
    console.log(`Shopify returned ${variants.length} variants.`);
    
    variants.forEach(v => {
      console.log(`- SKU: ${v.sku}, Qty: ${v.inventoryQuantity}`);
    });
    
    if (variants.length === 0 && inventory.length > 0) {
        console.warn("WARNING: Inventory has items but Shopify returned 0 variants. Check SKU matches!");
        console.log("Sample SKU from inventory:", inventory[0].sku);
    }

  } catch (err) {
    console.error("Error fetching from Shopify:", err.message);
  }
}

debugStock();
