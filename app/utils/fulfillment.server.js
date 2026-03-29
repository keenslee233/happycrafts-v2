import { apiVersion } from "../shopify.server.js";
import { convex, api } from "../db.server.js";

/**
 * Registers the "Happycrafts-Sync" fulfillment service and stores the location ID in Convex.
 * 
 * @param {Object} shopifyClient - The Shopify Admin API client (Remix admin or Standalone client)
 * @param {string} shop - The shop domain
 * @returns {Promise<string>} The fulfillment service's location ID
 */
export async function registerHappycraftsSync(shopifyClient, shop) {
  try {
    const query = `
      query getLocations {
        locations(first: 50) {
          nodes {
            id
            name
            fulfillmentService {
              id
              handle
            }
          }
        }
      }
    `;



    // Handle different client types (Remix admin has .graphql, Standalone has .request)
    const execute = async (q, vars = {}) => {
      let res;
      if (typeof shopifyClient.graphql === "function") {
        res = await shopifyClient.graphql(q, { variables: vars });
      } else if (typeof shopifyClient.request === "function") {
        res = await shopifyClient.request(q, { variables: vars });
      } else {
        throw new Error("Invalid shopifyClient: no graphql or request function found.");
      }

      // In some Remix versions, .graphql returns a standard Response object
      if (res && typeof res.json === "function") {
        return await res.json();
      }
      return res;
    };


    const response = await execute(query);
    const locations = response.data?.locations?.nodes || [];
    console.log(`[fulfillment.server.js] Found ${locations.length} total locations:`);
    locations.forEach(l => {
      console.log(`  - ${l.name} (${l.id}) Handle: ${l.fulfillmentService?.handle || "N/A"}`);
    });

    // Find if the service already exists
    const existing = locations.find(l => 
      l.fulfillmentService?.handle === "happycrafts-sync" || 
      l.name === "Happycrafts-Sync"
    );

    let locationId = existing?.id;



    if (!locationId) {
      console.log(`[fulfillment.server.js] Registering "Happycrafts-Sync" for ${shop}...`);
      const mutation = `
        mutation fulfillmentServiceCreate($name: String!, $callbackUrl: URL!, $inventoryManagement: Boolean!, $trackingSupport: Boolean!) {
          fulfillmentServiceCreate(name: $name, callbackUrl: $callbackUrl, inventoryManagement: $inventoryManagement, trackingSupport: $trackingSupport) {

            fulfillmentService {
              id
              location {
                id
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Use the Netlify URL for the callback
      const appUrl = process.env.SHOPIFY_APP_URL || "https://happycraftsv2.netlify.app";
      const callbackUrl = `${appUrl}/webhooks/fulfillment_orders`;

      const createResponse = await execute(mutation, {
        name: "Happycrafts-Sync",
        callbackUrl,
        inventoryManagement: true,
        trackingSupport: false // Sync only focused on inventory for now
      });

      console.log(`[fulfillment.server.js] Full createResponse keys:`, Object.keys(createResponse || {}));
      if (createResponse.errors) {
        console.error(`[fulfillment.server.js] GraphQL Errors:`, JSON.stringify(createResponse.errors, null, 2));
      }
      
      const result = createResponse.data?.fulfillmentServiceCreate || createResponse.fulfillmentServiceCreate;
      console.log(`[fulfillment.server.js] Mutation Result:`, JSON.stringify(result, null, 2));

      if (result?.userErrors?.length > 0) {
        throw new Error(result.userErrors[0].message);
      }

      locationId = result?.fulfillmentService?.location?.id;
      if (!locationId) {
        console.warn(`[fulfillment.server.js] locationId is null for ${shop}. Full service data:`, JSON.stringify(result?.fulfillmentService, null, 2));
      }


    }

    if (locationId) {
      console.log(`[fulfillment.server.js] Storing locationId ${locationId} for ${shop} in Convex...`);
      await convex.mutation(api.stores.upsertStore, {
        shop,
        locationId,
      });
    }

    return locationId;
  } catch (error) {
    console.error("[fulfillment.server.js] Error in registerHappycraftsSync:", error.message);
    throw error;
  }
}



/**
 * Ensures a FulfillmentService named "Happycrafts-Fulfillment" exists in the store.
 * Returns the location ID associated with the service.
 * 
 * @param {Object} shopifyClient - The Shopify Admin API client
 * @returns {Promise<string>} The fulfillment service's location ID
 */
export async function ensureFulfillmentService(shopifyClient) {
  try {
    const query = `
      query getServicesAndLocations {
        shop {
          fulfillmentServices {
            id
            handle
            serviceName
            location {
              id
              name
            }
          }
        }
        locations(first: 50) {
          nodes {
            id
          }
        }
      }
    `;

    const response = await shopifyClient.request(query);
    const services = response.data?.shop?.fulfillmentServices || [];
    const locations = response.data?.locations?.nodes || [];
    
    // 1. Find the primary/standard location first (as a fallback)
    const fallbackLocationId = locations[0]?.id;

    // 2. Find location by service handle or name
    // We prioritize "Happycrafts-Sync" (our new standard)
    const existing = services.find(s => 
      s.handle === "happycrafts-sync" || 
      s.serviceName === "Happycrafts-Sync"
    ) || services.find(s => 
      s.handle === "happycrafts-fulfillment" || 
      s.serviceName === "Happycrafts-Fulfillment"
    );

    if (existing && existing.location?.id) {
      return {
        fulfillmentLocationId: existing.location.id,
        primaryLocationId: fallbackLocationId,
        handle: existing.handle || "happycrafts-sync"
      };
    }


    
    console.log(`[fulfillment.server.js] Registering "Happycrafts-Fulfillment" for the first time...`);
    const mutation = `
      mutation fulfillmentServiceCreate($name: String!, $callbackUrl: URL, $inventoryManagement: Boolean!, $trackingSupport: Boolean!) {
        fulfillmentServiceCreate(name: $name, callbackUrl: $callbackUrl, inventoryManagement: $inventoryManagement, trackingSupport: $trackingSupport) {
          fulfillmentService {
            id
            handle
            location {
              id
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createResponse = await shopifyClient.request(mutation, {
      variables: {
        name: "Happycrafts-Fulfillment",
        callbackUrl: process.env.SHOPIFY_APP_URL || "https://happycrafts.app", // Fallback for safety
        inventoryManagement: true,
        trackingSupport: true
      }
    });

    const result = createResponse.data?.fulfillmentServiceCreate;
    if (result?.userErrors?.length > 0) {
      console.error(`[fulfillment.server.js] Registration error: ${result.userErrors[0].message}`);
      // If it's a "name has already been taken" error, we might have missed it
      if (result.userErrors[0].message.toLowerCase().includes("taken")) {
         // The service exists, the locations query above should have found it.
         // This block might be redundant but safe.
      }
      throw new Error(result.userErrors[0].message);
    }

    const newService = result?.fulfillmentService;
    if (!newService) {
      console.error(`[fulfillment.server.js] result?.fulfillmentService is null. Result: ${JSON.stringify(result)}`);
      throw new Error("Failed to retrieve fulfillment service after creation.");
    }
    console.log(`[fulfillment.server.js] Registered successfully: ${newService.handle} (${newService.location?.id})`);
    return {
      fulfillmentLocationId: newService.location?.id || fallbackLocationId,
      primaryLocationId: fallbackLocationId
    };
  } catch (error) {
    console.error("[fulfillment.server.js] EXCEPTION during fulfillment service check/creation:", error.message);
    return {
      fulfillmentLocationId: null,
      primaryLocationId: null
    };
  }
}
