import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { applyPricingRule } from "../utils/pricing.server.js";
import { ensureFulfillmentService } from "../utils/fulfillment.server.js";
import convex from "../db.server";

/**
 * Imports one or more products from the Master store to a Retail store.
 * Supports both single (sku=X) and bulk (skus=X,Y,Z) modes.
 * Fetches the PricingRule ONCE and applies it to all products (static/one-time).
 */
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const retailShop = session.shop;

  // Support both single and bulk
  const singleSku = formData.get("sku");
  const bulkSkus = formData.get("skus");
  const skuList = bulkSkus
    ? bulkSkus.split(",").map(s => s.trim()).filter(Boolean)
    : singleSku
      ? [singleSku]
      : [];

  if (skuList.length === 0) {
    return Response.json({ success: false, message: "No SKUs provided." });
  }

  const isBulk = skuList.length > 1;
  console.log(`--- ${isBulk ? 'BULK' : 'ONE-CLICK'} IMPORT: ${skuList.length} SKU(s) ---`);

  try {
    // ── 2. FETCH PRICING RULE ONCE ──
    const pricingRule = await convex.query(api.pricing.getPricingRule, {
      shop: retailShop
    });

    const shopifyClient = createAdminApiClient({
      storeDomain: retailShop,
      apiVersion: "2026-01",
      accessToken: session.accessToken,
    });

    // ── 2a. ENSURE FULFILLMENT SERVICE & GET LOCATION ID ──
    const { fulfillmentLocationId, primaryLocationId, handle } = await ensureFulfillmentService(shopifyClient);
    if (!fulfillmentLocationId && !primaryLocationId) {
      console.warn("Could not retrieve fulfillment or primary location. Inventory tracking might be limited.");
    }

    const managementHandle = handle || "happycrafts-sync";
    console.log(`[import] Using fulfillment location: ${fulfillmentLocationId}, management: ${managementHandle}`);


    // ── 3. LOOP THROUGH EACH SKU ──
    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const sku of skuList) {
      try {
        console.log(`Importing SKU: ${sku}...`);

        // Find product in Inventory to get masterStoreId
        const inventoryItem = await convex.query(api.inventory.getInventoryBySku, {
          sku: sku
        });

        if (!inventoryItem || !inventoryItem.masterStoreId) {
          console.warn(`SKU ${sku}: No master store association found in Inventory.`);
          results.push({ sku, success: false, message: "No master store found" });
          failCount++;
          continue;
        }

        // Get the specific Master session
        const wholesaleSession = await convex.query(api.sessions.findSessionByShopAndRole, {
          shop: inventoryItem.masterStoreId,
          role: 'WHOLESALE'
        });

        if (!wholesaleSession) {
          console.warn(`SKU ${sku}: Wholesale session for ${inventoryItem.masterStoreId} not found.`);
          results.push({ sku, success: false, message: "Wholesale store not connected" });
          failCount++;
          continue;
        }

        const wholesaleClient = createAdminApiClient({
          storeDomain: wholesaleSession.shop,
          apiVersion: "2026-01",
          accessToken: wholesaleSession.accessToken,
        });

        // Fetch variant from Master (more robust than searching products)
        const wsResponse = await wholesaleClient.request(`
          query getVariantBySku($query: String!) {
            productVariants(first: 1, query: $query) {
              nodes {
                price
                sku
                inventoryQuantity
                product {
                  title
                  vendor
                  productType
                  descriptionHtml
                  images(first: 10) {
                    nodes { url altText }
                  }
                }
              }
            }
          }
        `, { variables: { query: `sku:"${sku}"` } });

        if (wsResponse.errors) {
          const errCode = wsResponse.errors.networkStatusCode;
          const errMsg = wsResponse.errors.message || "Master API error";
          console.error(`Master Fetch Error for SKU ${sku}:`, JSON.stringify(wsResponse.errors));
          let userMessage = `Failed to fetch from Master store (${errCode || errMsg})`;
          
          if (errCode === 401 || errCode === 403) {
            userMessage = "Master store connection expired. Please log into the master store and reopen the app to re-authenticate.";
          }
          
          results.push({ sku, success: false, message: userMessage });
          failCount++;
          continue;
        }

        const wsVariant = wsResponse.data?.productVariants?.nodes[0];
        if (!wsVariant || !wsVariant.product) {
          console.warn(`SKU ${sku}: Not found on Master catalog.`, JSON.stringify(wsResponse.data));
          results.push({ sku, success: false, message: "Not found on Master store catalog." });
          failCount++;
          continue;
        }

        const wsProduct = wsVariant.product;
        const variantData = wsVariant;
        const masterPrice = parseFloat(variantData.price);
        const retailPrice = applyPricingRule(masterPrice, pricingRule);

        // ── Create product with SKU, Price, and Tracking in ONE atomic call ──
        const uniqueHandle = `imported-${sku.toLowerCase()}-${Date.now()}`;

        // ── Attach media (productSet accepts files input) ──
        const filesInput = (wsProduct.images?.nodes || []).map(img => ({
          originalSource: img.url,
          alt: img.altText || wsProduct.title,
          contentType: "IMAGE",
        }));

        console.log(`Creating product with SKU=${sku}, Price=$${retailPrice} via productSet...`);
        
        const initialQty = Math.floor(inventoryItem.quantity ?? inventoryItem.stockLevel ?? 0);

        const createResponse = await shopifyClient.request(`
          mutation productSet($input: ProductSetInput!) {
            productSet(synchronous: true, input: $input) {
              product {
                id
                handle
                variants(first: 1) {
                  nodes {
                    id
                    sku
                    price
                    inventoryItem { id sku tracked }
                  }
                }
              }
              userErrors { field message }
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
              productOptions: [{
                name: "Title",
                values: [{ name: "Default Title" }]
              }],
              files: filesInput,
              variants: [
                {
                  price: String(retailPrice),
                  sku: String(sku),
                  optionValues: [{ name: "Default Title", optionName: "Title" }],
                  inventoryPolicy: "DENY",
                  ...(fulfillmentLocationId ? {
                    inventoryQuantities: [
                      {
                        locationId: fulfillmentLocationId,
                        name: "available",
                        quantity: initialQty
                      }
                    ]
                  } : {})
                }
              ]
            }
          }
        });

        if (createResponse.errors) {
          const errObj = createResponse.errors;
          console.error(`SKU ${sku}: ── FULL API ERROR ──`);
          console.error(`  networkStatusCode: ${errObj.networkStatusCode}`);
          console.error(`  message: ${errObj.message}`);
          if (errObj.graphQLErrors) {
            errObj.graphQLErrors.forEach((ge, i) => {
              console.error(`  graphQLError[${i}]: ${ge.message}`);
            });
          }
          const errorMsg = errObj.graphQLErrors?.[0]?.message || errObj.message || "API error";
          results.push({ sku, success: false, message: errorMsg });
          failCount++;
          continue;
        }

        const createErrors = createResponse.data?.productSet?.userErrors;
        if (createErrors?.length > 0) {
          console.error(`SKU ${sku}: ${createErrors[0].message}`);
          results.push({ sku, success: false, message: createErrors[0].message });
          failCount++;
          continue;
        }

        const newProduct = createResponse.data?.productSet?.product;
        if (!newProduct) {
          results.push({ sku, success: false, message: "Empty response" });
          failCount++;
          continue;
        }

        const createdVariant = newProduct.variants.nodes[0];
        const defaultVariantId = createdVariant?.id;
        const inventoryItemId = createdVariant?.inventoryItem?.id;

        console.log(`✓ Product created successfully: ${newProduct.id}. Inventory Item: ${inventoryItemId}`);

        // If for some reason tracking wasn't enabled automatically by productSet, ensure it is.
        if (inventoryItemId && !createdVariant?.inventoryItem?.tracked) {
          console.log(`  Enabling tracking for ${inventoryItemId} (fallback)...`);
          await shopifyClient.request(`
            mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
              inventoryItemUpdate(id: $id, input: $input) {
                userErrors { field message }
              }
            }
          `, {
            variables: { id: inventoryItemId, input: { tracked: true } }
          });
        }

        console.log(`✓ SKU ${sku}: Processed successfully.`);


        // ── SAVE MAPPING IN CONVEX ──
        await convex.mutation(api.productMappings.upsertMapping, {
          masterSku: sku,
          retailShop: retailShop,
          retailProductId: newProduct.id,
          retailVariantId: defaultVariantId || "",
          retailSku: sku,
          createdAt: Date.now()
        });

        // ── CLEANUP FROM IMPORT LIST ──
        await convex.mutation(api.importList.remove, {
          shop: retailShop,
          sku: sku
        });

        await convex.mutation(api.inventory.upsertInventory, {
          sku: sku,
          productName: wsProduct.title,
          stockLevel: variantData.inventoryQuantity || 0,
          quantity: variantData.inventoryQuantity || 0,
          retailProductId: newProduct.id,
          masterStoreId: inventoryItem.masterStoreId,
          masterCostPrice: inventoryItem.masterCostPrice,
          isListed: true,
          isPublic: true
        });

        await convex.mutation(api.syncLogs.createLog, {
          shop: retailShop,
          sku: sku,
          status: "SUCCESS",
          message: `Imported "${wsProduct.title}" ($${masterPrice} → $${retailPrice})`,
          createdAt: Date.now()
        });

        console.log(`✓ SKU ${sku}: "${wsProduct.title}" → $${retailPrice}`);
        results.push({
          sku,
          success: true,
          productId: newProduct.id,
          handle: newProduct.handle,
          title: wsProduct.title,
          masterPrice,
          retailPrice,
        });
        successCount++;

      } catch (skuErr) {
        console.error(`SKU ${sku} EXCEPTION:`, skuErr.message);
        // Extract GraphQL errors if the library threw them
        if (skuErr.graphQLErrors) {
          skuErr.graphQLErrors.forEach((ge, i) => {
            console.error(`  graphQLError[${i}]: ${ge.message}`);
          });
        }
        if (skuErr.response) {
          console.error(`  Response status: ${skuErr.response.status}`);
        }
        const errorMsg = skuErr.graphQLErrors?.[0]?.message || skuErr.message;
        results.push({ sku, success: false, message: errorMsg });
        failCount++;
      }
    }

    // ── FINAL RESPONSE ──
    const message = isBulk
      ? `Successfully imported ${successCount} product${successCount !== 1 ? 's' : ''} with current pricing rules${failCount > 0 ? ` (${failCount} failed)` : ''}`
      : successCount > 0
        ? "Product imported successfully!"
        : results[0]?.message || "Import failed.";

    return Response.json({
      success: successCount > 0,
      message,
      results,
      successCount,
      failCount,
      // For single-import backward compat
      ...(results.length === 1 && results[0].success ? {
        productId: results[0].productId,
        handle: results[0].handle,
        title: results[0].title,
        masterPrice: results[0].masterPrice,
        retailPrice: results[0].retailPrice,
      } : {}),
    });

  } catch (e) {
    console.error("Import Exception:", e);
    return Response.json({ success: false, message: e.message });
  }
};
