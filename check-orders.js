import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { api } from './convex/_generated/api.js';

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

const orders = await convex.query(api.orders.listOrders, {});
console.log(`\n📦 Total pushed orders: ${orders.length}`);
for (const o of orders) {
  console.log(`  - Retail Order: ${o.retailOrderId} | Shop: ${o.shop} | Draft: ${o.masterDraftOrderId} | Customer: ${o.customerEmail} | City: ${o.shippingCity}`);
}

if (orders.length === 0) {
  console.log("  (none found)");
}

process.exit(0);
