import { createAdminApiClient } from '@shopify/admin-api-client';
import db from '../db.server';

export async function updateRetailInventory(shop, accessToken, sku, quantity) {
  if (!shop || !accessToken) {
    console.warn("⚠️ Missing shop or access token for retail sync.");
    return;
  }

  // Normalize shop URL
  const shopName = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

  console.log(`🔄 Syncing SKU ${sku} to Retail Store: ${shopName} (Qty: ${quantity})`);

  try {
    const client = createAdminApiClient({
      storeDomain: shopName,
      apiVersion: '2026-01',
      accessToken: accessToken,
    });

    let inventoryItemId = null;
    let locationId = null;

    // 1. Check for Mapping First
    const mapping = await db.productMapping.findUnique({
      where: {
        masterSku_retailShop: {
          masterSku: sku,
          retailShop: shop,
        }
      }
    });

    if (mapping) {
      console.log(`📍 Found Mapping for ${sku} -> Variant ID: ${mapping.retailVariantId}`);
      const getVariantQuery = `
        query getVariant($id: ID!) {
          productVariant(id: $id) {
            inventoryItem {
              id
              inventoryLevels(first: 1) {
                nodes {
                  location { id }
                }
              }
            }
          }
        }
      `;
      const { data } = await client.request(getVariantQuery, { variables: { id: mapping.retailVariantId } });
      const variant = data?.productVariant;
      if (variant) {
        inventoryItemId = variant.inventoryItem.id;
        locationId = variant.inventoryItem.inventoryLevels?.nodes?.[0]?.location?.id;
      }
    }

    // 2. Fallback to SKU Search if no mapping or variant not found
    if (!inventoryItemId) {
      console.log(`🔍 No mapping found or variant missing. Falling back to SKU search for ${sku}...`);
      const findVariantQuery = `
        query findVariant($query: String!) {
          productVariants(first: 1, query: $query) {
            edges {
              node {
                id
                inventoryItem {
                  id
                  inventoryLevels(first: 1) {
                    nodes {
                      location { id }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const { data: findData } = await client.request(findVariantQuery, { variables: { query: `sku:${sku}` } });
      const edges = findData?.productVariants?.edges;
      if (edges && edges.length > 0) {
        const variantNode = edges[0].node;
        inventoryItemId = variantNode.inventoryItem.id;
        locationId = variantNode.inventoryItem.inventoryLevels?.nodes?.[0]?.location?.id;
      }
    }

    if (!inventoryItemId || !locationId) {
      console.warn(`⚠️ SKU ${sku} could not be resolved in Retail store: ${shopName}`);
      return;
    }

    // 2. Set Quantity
    const setQuantityMutation = `
      mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors {
            field
            message
          }
          inventoryState {
            quantities {
              name
              quantity
            }
          }
        }
      }
    `;

    const { data: updateData, errors: updateErrors } = await client.request(setQuantityMutation, {
      variables: {
        input: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId: inventoryItemId,
              locationId: locationId,
              quantity: quantity
            }
          ]
        }
      },
    });

    if (updateErrors) {
      console.error(`❌ Retail GraphQL Error (Update) for ${shopName}:`, updateErrors);
    } else if (updateData?.inventorySetQuantities?.userErrors?.length > 0) {
      console.error(`❌ Retail Update User Errors for ${shopName}:`, updateData.inventorySetQuantities.userErrors);
    } else {
      console.log(`✅ Retail Sync Success for ${shopName} - SKU: ${sku} -> Quantity: ${quantity}`);
    }

  } catch (error) {
    console.error(`❌ Network/Client error syncing to Retail ${shopName}:`, error);
  }
}
