import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { ensureFulfillmentService } from "../utils/fulfillment.server.js";
import { createAdminApiClient } from "@shopify/admin-api-client";

export const loader = async ({ request }) => {
  const authResult = await authenticate.admin(request);
  const { session } = authResult;

  // Register Fulfillment Service during installation/load
  try {
    const shopifyClient = createAdminApiClient({
      storeDomain: session.shop,
      apiVersion: "2026-01",
      accessToken: session.accessToken,
    });
    await ensureFulfillmentService(shopifyClient);
  } catch (err) {
    console.error("Fulfillment service registration failed:", err.message);
  }

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
