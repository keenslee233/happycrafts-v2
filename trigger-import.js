import { createAdminApiClient } from "@shopify/admin-api-client";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { applyPricingRule } from "./app/utils/pricing.server.js";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function run() {
  const sku = '1221';
  const retailShop = 'happycrafts-retail.myshopify.com';

  const wholesaleSession = await client.query(api.sessions.findSessionByRole, { role: 'WHOLESALE' });
  const retailSession = await client.query(api.sessions.findSessionsByShop, { shop: retailShop }).then(s => s[0]);
  
  if (!wholesaleSession || !retailSession) return console.log("MISSING SESSIONS");

  const wholesaleClient = createAdminApiClient({
    storeDomain: wholesaleSession.shop, apiVersion: "2026-01", accessToken: wholesaleSession.accessToken,
  });
  const retailClient = createAdminApiClient({
    storeDomain: retailSession.shop, apiVersion: "2026-01", accessToken: retailSession.accessToken,
  });

  // Fetch pricing rule
  const pricingRule = await client.query(api.pricing.getPricingRule, { shop: retailShop });
  console.log(`Pricing Rule: ${pricingRule?.enabled ? pricingRule.mode + ' ' + pricingRule.value : 'disabled/none'}`);

  // Fetch product from Master
  console.log(`\n=== Fetching Master Product SKU ${sku} ===`);
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
  `, { variables: { query: `sku:${sku}` } });

  const wsProduct = wsResponse.data?.products?.nodes[0];
  if (!wsProduct) return console.log("Not found on Master");
  const variantData = wsProduct.variants.nodes[0];
  const masterPrice = parseFloat(variantData.price);
  const retailPrice = applyPricingRule(masterPrice, pricingRule);
  console.log(`Found: "${wsProduct.title}" — Master: $${masterPrice}, Retail: $${retailPrice}`);

  // productSet
  const uniqueHandle = `imported-${sku.toLowerCase()}-${Date.now()}`;
  console.log(`\n=== productSet (SKU=${sku}, Price=$${retailPrice}) ===`);
  const createResponse = await retailClient.request(`
    mutation productSet($input: ProductSetInput!) {
      productSet(input: $input) {
        product {
          id handle
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
        variants: [{
          optionValues: [{ optionName: "Title", name: "Default Title" }],
          price: String(retailPrice),
          inventoryItem: { sku: String(sku), tracked: false }
        }]
      }
    }
  });

  if (createResponse.errors) return console.log("ERRORS:", createResponse.errors);
  const createErrors = createResponse.data?.productSet?.userErrors;
  if (createErrors?.length > 0) return console.log("USER ERRORS:", createErrors);

  const newProduct = createResponse.data?.productSet?.product;
  const createdVariant = newProduct?.variants?.nodes?.[0];
  const defaultVariantId = createdVariant?.id;

  // Save to Convex
  console.log(`\n=== Saving to Convex ===`);
  await client.mutation(api.productMappings.upsertMapping, {
    masterSku: sku, retailShop,
    retailProductId: newProduct.id,
    retailVariantId: defaultVariantId || "",
    retailSku: sku,
    createdAt: Date.now()
  });

  await client.mutation(api.inventory.upsertInventory, {
    sku, 
    productName: wsProduct.title, 
    stockLevel: variantData.inventoryQuantity || 0, 
    retailProductId: newProduct.id,
    isListed: true,
    isPublic: true
  });

  await client.mutation(api.syncLogs.createLog, { 
    shop: retailShop, 
    sku, 
    status: "SUCCESS", 
    message: `Imported "${wsProduct.title}" ($${masterPrice} → $${retailPrice})`,
    createdAt: Date.now()
  });

  // Final verification
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  END-TO-END IMPORT RESULT                        ║`);
  console.log(`╠══════════════════════════════════════════════════╣`);
  console.log(`║  Title:         ${wsProduct.title}`);
  console.log(`║  Product ID:    ${newProduct.id}`);
  console.log(`║  Variant ID:    ${defaultVariantId}`);
  console.log(`║  Variant SKU:   ${createdVariant?.sku || '(empty!)'}`);
  console.log(`║  InvItem SKU:   ${createdVariant?.inventoryItem?.sku || '(empty!)'}`);
  console.log(`║  Master Price:  $${masterPrice}`);
  console.log(`║  Retail Price:  $${createdVariant?.price}`);
  console.log(`║  Tracked:       ${createdVariant?.inventoryItem?.tracked}`);
  console.log(`╚══════════════════════════════════════════════════╝`);

  if (createdVariant?.sku === sku) {
    console.log("\n✅ SKU HANDSHAKE CONFIRMED — 1221 set correctly!");
  } else {
    console.log(`\n❌ FAIL: Expected SKU "${sku}" but got "${createdVariant?.sku}"`);
  }

  // Verify Convex
  console.log("\n=== Convex Records ===");
  const inv = await client.query(api.inventory.getInventoryBySku, { sku });
  console.log(`Inventory: SKU=${inv?.sku}, retailProductId=${inv?.retailProductId}`);
  const map = await client.query(api.productMappings.listMappings, { masterSku: sku, retailShop }).then(m => m[0]);
  console.log(`Mapping: masterSku=${map?.masterSku}, retailSku=${map?.retailSku}, retailProductId=${map?.retailProductId}`);
}

run().catch(console.error).finally(() => process.exit(0));
