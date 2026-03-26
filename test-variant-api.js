import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  const masterSku = '1221';
  const retailShopDomain = 'happycrafts-retail.myshopify.com';

  const wholesaleSession = await client.query(api.sessions.findSessionByRole, { role: 'WHOLESALE' });
  const retailSession = await client.query(api.sessions.findSessionsByShop, { shop: retailShopDomain }).then(s => s[0]);
  
  if (!wholesaleSession || !retailSession) return console.log("MISSING SESSIONS");

  const wholesaleClient = createAdminApiClient({
    storeDomain: wholesaleSession.shop, apiVersion: "2026-01", accessToken: wholesaleSession.accessToken,
  });
  const retailClient = createAdminApiClient({
    storeDomain: retailSession.shop, apiVersion: "2026-01", accessToken: retailSession.accessToken,
  });

  // Fetch from Master
  console.log("=== Fetching Master Product ===");
  const wsResponse = await wholesaleClient.request(`
    query getProduct($query: String!) {
      products(first: 1, query: $query) {
        nodes {
          title vendor productType descriptionHtml
          images(first: 10) { nodes { url altText } }
          variants(first: 1) { nodes { price sku inventoryQuantity } }
        }
      }
    }
  `, { variables: { query: `sku:${masterSku}` } });

  const wsProduct = wsResponse.data?.products?.nodes[0];
  if (!wsProduct) return console.log("Not found");
  const variantData = wsProduct.variants.nodes[0];
  console.log(`Found: "${wsProduct.title}" (SKU: ${variantData.sku}, Price: $${variantData.price})`);

  const retailPrice = parseFloat(variantData.price);
  const uniqueHandle = `imported-${masterSku.toLowerCase()}-${Date.now()}`;

  // Test: productSet mutation
  console.log("\n=== Testing productSet ===");
  const response = await retailClient.request(`
    mutation productSet($input: ProductSetInput!) {
      productSet(input: $input) {
        product {
          id title handle
          variants(first: 1) {
            nodes {
              id sku price
              inventoryItem { id sku tracked }
            }
          }
        }
        userErrors { field message code }
      }
    }
  `, {
    variables: {
      input: {
        title: wsProduct.title,
        handle: uniqueHandle,
        vendor: wsProduct.vendor || "Master Store",
        productType: wsProduct.productType || "Imported",
        descriptionHtml: wsProduct.descriptionHtml || "",
        productOptions: [
          { name: "Title", position: 1, values: [{ name: "Default Title" }] }
        ],
        variants: [
          {
            optionValues: [{ optionName: "Title", name: "Default Title" }],
            price: String(retailPrice),
            inventoryItem: {
              sku: String(masterSku),
              tracked: false
            }
          }
        ]
      }
    }
  });

  if (response.errors) {
    console.log("GraphQL Errors:", JSON.stringify(response.errors, null, 2));
    return;
  }

  const result = response.data?.productSet;
  if (result?.userErrors?.length > 0) {
    console.log("User Errors:", JSON.stringify(result.userErrors, null, 2));
    return;
  }

  const product = result?.product;
  const variant = product?.variants?.nodes?.[0];

  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  productSet RESULT                            ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Title:       ${product?.title}`);
  console.log(`║  Product ID:  ${product?.id}`);
  console.log(`║  Variant SKU: ${variant?.sku || '(empty)'}`);
  console.log(`║  InvItem SKU: ${variant?.inventoryItem?.sku || '(empty)'}`);
  console.log(`║  Price:       $${variant?.price}`);
  console.log(`║  Tracked:     ${variant?.inventoryItem?.tracked}`);
  console.log(`╚══════════════════════════════════════════════╝`);

  if (variant?.sku === masterSku || variant?.inventoryItem?.sku === masterSku) {
    console.log("\n✅ SUCCESS: SKU 1221 is correctly set!");
  } else {
    console.log(`\n❌ FAIL: Expected "${masterSku}"`);
  }
}

run().catch(console.error).finally(() => process.exit(0));
