import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import 'dotenv/config';

const client = new ConvexHttpClient(process.env.CONVEX_URL);

async function listRetailProducts() {
    try {
        const retailSession = await client.query(api.sessions.findSessionByShopAndRole, {
            shop: 'happcrafts-test.myshopify.com',
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

        const productsResponse = await shopifyClient.request(`
      query {
        products(first: 10) {
          nodes {
            id
            title
            variants(first: 5) {
              nodes {
                id
                sku
                title
              }
            }
          }
        }
      }
    `);

        console.log('--- PRODUCTS ON RETAIL STORE ---');
        productsResponse.data?.products?.nodes.forEach(p => {
            console.log(`Product: ${p.title} (${p.id})`);
            p.variants.nodes.forEach(v => {
                console.log(`  Variant: ${v.title} | SKU: ${v.sku || 'MISSING'} | ID: ${v.id}`);
            });
        });

    } catch (error) {
        console.error('Error fetching products:', error);
    } finally {
        process.exit(0);
    }
}

listRetailProducts();
