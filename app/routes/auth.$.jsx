import { authenticate } from "../shopify.server";
import { ensureFulfillmentService } from "../utils/fulfillment.server.js";
import { createAdminApiClient } from "@shopify/admin-api-client";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // Register Fulfillment Service during installation/load
  const shopifyClient = createAdminApiClient({
    storeDomain: session.shop,
    apiVersion: "2026-01",
    accessToken: session.accessToken,
  });
  await ensureFulfillmentService(shopifyClient);

  return null;
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
