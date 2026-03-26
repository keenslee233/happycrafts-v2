import { authenticate } from "../shopify.server";
import db from "../db.server";
import { forwardOrder } from "../utils/order-forwarding.server";

export const action = async ({ request }) => {
    const { topic, shop, payload } = await authenticate.webhook(request);

    console.log(`🔔 Received ${topic} from ${shop}`);

    const validTopics = ["ORDERS_CREATE", "orders/create", "ORDERS_PAID", "orders/paid", "DRAFT_ORDERS_CREATE", "draft_orders/create"];
    if (!validTopics.includes(topic)) {
        return new Response();
    }

    const order = payload;
    const sourceName = order.source_name || "unknown";

    // Requirements: Listen for both CREATE and PAID. 
    // We already have duplicate check in forwardOrder utility.
    console.log(`🔍 [DEBUG] Webhook Logic Initiated for ${order.name} (Source: ${sourceName})`);

    // Use the shared utility for forwarding
    try {
        await forwardOrder({
            shop,
            order
        });
    } catch (error) {
        console.error(`❌ Error in order webhook for ${shop}:`, error.message);
    }

    return new Response();
};
