/**
 * Registers webhook subscriptions on the retail store 
 * pointing to the current Cloudflare tunnel URL.
 * 
 * Usage: node register-retail-webhooks.js <tunnel-url>
 * Example: node register-retail-webhooks.js https://summer-resulting-remove-fallen.trycloudflare.com
 */
import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';
import { createAdminApiClient } from '@shopify/admin-api-client';

const tunnelUrl = process.argv[2];
if (!tunnelUrl) {
  console.error('❌ Please provide the current tunnel URL as an argument');
  console.error('   Usage: node register-retail-webhooks.js https://your-tunnel.trycloudflare.com');
  process.exit(1);
}

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

// Webhook topics and their local route paths
const WEBHOOKS = [
  { topic: 'ORDERS_CREATE', path: '/webhooks/orders_create' },
  { topic: 'ORDERS_PAID', path: '/webhooks/orders_create' },
  { topic: 'PRODUCTS_UPDATE', path: '/webhooks/products_update' },
  { topic: 'FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED', path: '/webhooks/fulfillment_orders' },
  { topic: 'FULFILLMENT_ORDERS_CANCELLATION_REQUEST_SUBMITTED', path: '/webhooks/fulfillment_orders' },
];

async function run() {
  // 1. Find the retail store session
  const retailSessions = await convex.query(api.sessions.findSessionsByRole, { role: 'RETAIL' });
  
  if (retailSessions.length === 0) {
    console.error('❌ No RETAIL session found in Convex.');
    process.exit(1);
  }

  const retailSession = retailSessions[0];
  console.log(`\n🏪 Retail store: ${retailSession.shop}`);
  console.log(`🔗 Tunnel URL: ${tunnelUrl}`);

  const client = createAdminApiClient({
    storeDomain: retailSession.shop,
    apiVersion: '2026-01',
    accessToken: retailSession.accessToken,
  });

  // 2. List existing webhook subscriptions
  console.log('\n📋 Checking existing webhooks...');
  const existingRes = await client.request(`
    query {
      webhookSubscriptions(first: 50) {
        nodes {
          id topic
          endpoint { ... on WebhookHttpEndpoint { callbackUrl } }
        }
      }
    }
  `);

  const existingWebhooks = existingRes.data?.webhookSubscriptions?.nodes || [];
  console.log(`   Found ${existingWebhooks.length} existing webhooks`);

  for (const wh of existingWebhooks) {
    const url = wh.endpoint?.callbackUrl || 'N/A';
    const isStale = !url.includes(new URL(tunnelUrl).hostname);
    console.log(`   ${isStale ? '⚠️' : '✅'} ${wh.topic} → ${url}`);
  }

  // 3. Delete stale webhooks and re-register
  for (const webhook of WEBHOOKS) {
    const callbackUrl = `${tunnelUrl}${webhook.path}`;

    // Check if already registered with current URL
    const existing = existingWebhooks.find(
      wh => wh.topic === webhook.topic && wh.endpoint?.callbackUrl === callbackUrl
    );
    if (existing) {
      console.log(`✅ ${webhook.topic} already registered at ${callbackUrl}`);
      continue;
    }

    // Delete any stale subscription for this topic
    const stale = existingWebhooks.find(wh => wh.topic === webhook.topic);
    if (stale) {
      console.log(`🗑️  Deleting stale ${webhook.topic} webhook...`);
      await client.request(`
        mutation deleteWebhook($id: ID!) {
          webhookSubscriptionDelete(id: $id) {
            deletedWebhookSubscriptionId
            userErrors { field message }
          }
        }
      `, { variables: { id: stale.id } });
    }

    // Create new subscription
    console.log(`📌 Registering ${webhook.topic} → ${callbackUrl}`);
    const res = await client.request(`
      mutation webhookCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription { id topic }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        topic: webhook.topic,
        webhookSubscription: {
          callbackUrl,
          format: 'JSON',
        },
      },
    });

    const errors = res.data?.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length > 0) {
      console.error(`   ❌ Error: ${errors[0].message}`);
    } else {
      console.log(`   ✅ Registered successfully`);
    }
  }

  console.log('\n🎉 Done! Webhooks should now point to your current tunnel.');
  console.log('   Try creating a new order on the retail store.\n');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
