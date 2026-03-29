import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  const sku = '1234'; // Selling Plans Ski Wax
  // const sku = '3231';
  
  const wholesaleSession = await client.query(api.sessions.findSessionByRole, { role: 'WHOLESALE' });
  if (!wholesaleSession) return console.log("Wholesale session not found");

  const shopifyClient = createAdminApiClient({
    storeDomain: wholesaleSession.shop,
    apiVersion: "2026-01",
    accessToken: wholesaleSession.accessToken,
  });

  console.log(`Testing SKU: ${sku} on ${wholesaleSession.shop}`);

  // Test 1: Original query
  console.log("\n--- Test 1: products(query: \"sku:SKU\") ---");
  const res1 = await shopifyClient.request(`
    query getProduct($query: String!) {
      products(first: 1, query: $query) {
        nodes { title id }
      }
    }
  `, { variables: { query: `sku:${sku}` } });
  console.log("Full Response 1:", JSON.stringify(res1, null, 2));

  // Test 2: productVariants(query: \"sku:SKU\")
  console.log("\n--- Test 2: productVariants(query: \"sku:SKU\") ---");
  const res2 = await shopifyClient.request(`
    query getVariant($query: String!) {
      productVariants(first: 1, query: $query) {
        nodes { 
          sku
          product { title id }
        }
      }
    }
  `, { variables: { query: `sku:${sku}` } });
  console.log("Full Response 2:", JSON.stringify(res2, null, 2));

  // Test 3: products(query: \"SKU\") - just the SKU
  console.log("\n--- Test 3: products(query: \"SKU\") ---");
  const res3 = await shopifyClient.request(`
    query getProduct($query: String!) {
      products(first: 1, query: $query) {
        nodes { title id }
      }
    }
  `, { variables: { query: sku } });
  console.log("Result:", JSON.stringify(res3.data?.products?.nodes, null, 2));
}

run().catch(console.error).finally(() => process.exit(0));
