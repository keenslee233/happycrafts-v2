import { authenticate } from "../shopify.server";
import { forwardOrder } from "../utils/order-forwarding.server";

export const action = async ({ request }) => {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`🔔 Received ${topic} from ${shop}`);

    const validTopics = ["ORDERS_CREATE", "orders/create", "ORDERS_PAID", "orders/paid"];
    if (!validTopics.includes(topic)) {
        return new Response();
    }

    const order = payload;
    const sourceName = order.source_name || "unknown";

    console.log(`🔍 [DEBUG] Webhook Logic Initiated for ${order.name} (Source: ${sourceName})`);

    // Use the shared utility for forwarding
    try {
        const result = await forwardOrder({ shop, order });
        console.log(`📋 Forward result for ${order.name}: ${result.success ? '✅' : '⚠️'} ${result.message || result.draftOrderName || ''}`);
    } catch (error) {
        console.error(`❌ Error in order webhook for ${shop}:`, error.message);
    }

    return new Response();
};

