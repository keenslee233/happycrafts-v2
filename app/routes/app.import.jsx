import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { applyPricingRule } from "../utils/pricing.server.js";
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

        // Fetch product from Master
        const wsResponse = await wholesaleClient.request(`
          query getProduct($query: String!) {
            products(first: 1, query: $query) {
              nodes {
                title
                vendor
                productType
                descriptionHtml
                images(first: 10) {
                  nodes { url altText }
                }
                variants(first: 1) {
                  nodes { price sku inventoryQuantity }
                }
              }
            }
          }
        `, { variables: { query: `sku:${sku}` } });

        const wsProduct = wsResponse.data?.products?.nodes[0];
        if (!wsProduct) {
          console.warn(`SKU ${sku}: Not found on Master`);
          results.push({ sku, success: false, message: "Not found" });
          failCount++;
          continue;
        }

        const variantData = wsProduct.variants.nodes[0];
        const masterPrice = parseFloat(variantData.price);
        const retailPrice = applyPricingRule(masterPrice, pricingRule);

        // ── Create product with SKU, Price, and Tracking in ONE atomic call ──
        const uniqueHandle = `imported-${sku.toLowerCase()}-${Date.now()}`;

        console.log(`Creating product with SKU=${sku}, Price=$${retailPrice}...`);
        const createResponse = await shopifyClient.request(`
          mutation productSet($input: ProductSetInput!) {
            productSet(input: $input) {
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
                    sku: String(sku),
                    tracked: false
                  }
                }
              ]
            },
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
              if (ge.extensions) console.error(`    extensions: ${JSON.stringify(ge.extensions)}`);
            });
          }
          console.error(`  Full error JSON: ${JSON.stringify(errObj, null, 2)}`);
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
        console.log(`✓ Product created: SKU=${createdVariant?.sku}, Price=$${createdVariant?.price}, Tracked=${createdVariant?.inventoryItem?.tracked}`);

        // ── Attach media separately (productSet doesn't accept media directly) ──
        const mediaInput = (wsProduct.images?.nodes || []).map(img => ({
          originalSource: img.url,
          alt: img.altText || wsProduct.title,
          mediaContentType: "IMAGE",
        }));

        if (mediaInput.length > 0) {
          try {
            await shopifyClient.request(`
              mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
                productCreateMedia(productId: $productId, media: $media) {
                  mediaUserErrors { field message }
                }
              }
            `, {
              variables: {
                productId: newProduct.id,
                media: mediaInput
              }
            });
          } catch (mediaErr) {
            console.warn(`Media attach failed for SKU ${sku}: ${mediaErr.message}`);
          }
        }

        // ── SAVE MAPPING IN CONVEX ──
        await convex.mutation(api.productMappings.createMapping, {
          masterSku: sku,
          retailShop: retailShop,
          retailProductId: newProduct.id,
          retailVariantId: defaultVariantId || "",
          retailSku: sku,
          createdAt: Date.now()
        });

        await convex.mutation(api.inventory.upsertInventory, {
          sku: sku,
          productName: wsProduct.title,
          stockLevel: variantData.inventoryQuantity || 0,
          retailProductId: newProduct.id,
          masterStoreId: inventoryItem.masterStoreId,
          masterCostPrice: inventoryItem.masterCostPrice
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
