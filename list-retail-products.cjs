const { PrismaClient } = require('@prisma/client');
const { createAdminApiClient } = require('@shopify/admin-api-client');

const db = new PrismaClient();

async function listRetailProducts() {
    try {
        const retailSession = await db.session.findFirst({
            where: { shop: 'happcrafts-test.myshopify.com', role: 'RETAIL' }
        });

        if (!retailSession) {
            console.error('Retail session not found.');
            return;
        }

        const client = createAdminApiClient({
            storeDomain: retailSession.shop,
            apiVersion: '2026-01',
            accessToken: retailSession.accessToken,
        });

        const productsResponse = await client.request(`
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
        await db.$disconnect();
    }
}

listRetailProducts();
