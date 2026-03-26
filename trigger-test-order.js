import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function createOrderForSku(sku) {
  try {
    const retailSession = await client.query(api.sessions.findSessionByShopAndRole, {
        shop: 'happycrafts-retail.myshopify.com',
        role: 'RETAIL'
    });

    if (!retailSession) {
      console.error('Retail session not found.');
      return;
    }

    const shopifyClient = createAdminApiClient({
      storeDomain: retailSession.shop,
      apiVersion: '2026-01',
      accessToken: retailSession.accessToken,
    });

    console.log(`Searching for SKU: ${sku} on ${retailSession.shop}...`);

    const variantResponse = await shopifyClient.request(`
      query getVariant($query: String!) {
        productVariants(first: 1, query: $query) {
          nodes {
            id
            product {
              title
            }
          }
        }
      }
    `, {
      variables: { query: `sku:${sku}` }
    });

    const variantId = variantResponse.data?.productVariants?.nodes[0]?.id;
    if (!variantId) {
      console.error(`SKU ${sku} not found on the retail store. Please make sure it's imported.`);
      return;
    }

    console.log(`Found variant: ${variantId} on Retail. Creating order...`);

    const orderResponse = await shopifyClient.request(`
      mutation orderCreate($input: OrderCreateInput!) {
        orderCreate(input: $input) {
          order { id name }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          lineItems: [{ variantId, quantity: 1 }],
          email: "manual-test@example.com",
          financialStatus: "PAID",
          shippingAddress: {
            address1: "456 Test Blvd",
            city: "Toronto",
            province: "Ontario",
            country: "Canada",
            zip: "M5V 2N2",
            firstName: "Manual",
            lastName: "Tester"
          }
        }
      }
    });

    if (orderResponse.data?.orderCreate?.userErrors?.length > 0) {
      console.error('Errors:', orderResponse.data.orderCreate.userErrors);
    } else {
      console.log('SUCCESS! Order created:', orderResponse.data.orderCreate.order.name);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

createOrderForSku('TEST100');
