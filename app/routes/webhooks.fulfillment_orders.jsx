import { authenticate } from "../shopify.server";
import { forwardOrder } from "../utils/order-forwarding.server.js";

export const action = async ({ request }) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  console.log(`🔔 Received Fulfillment Webhook: ${topic} from ${shop}`);

  // Topic normalization
  const isFulfillmentRequest = topic === "FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED" || 
                               topic === "fulfillment_orders/fulfillment_request_submitted";

  if (isFulfillmentRequest) {
    const fulfillmentOrder = payload.fulfillment_order;
    if (!fulfillmentOrder) {
        console.warn("⚠️ Fulfillment request payload missing fulfillment_order object.");
        return new Response();
    }
    
    const orderId = fulfillmentOrder.order_id;
    console.log(`📦 Fulfillment Request for Order ID: ${orderId}`);

    // Fetch the full order to get details for forwarding
    try {
        const response = await admin.graphql(`
            query getOrder($id: ID!) {
              order(id: $id) {
                id name email sourceName
                shippingAddress {
                  address1 address2 city province zip country firstName lastName phone
                }
                lineItems(first: 50) {
                  nodes {
                    sku title quantity
                  }
                }
              }
            }
        `, { variables: { id: `gid://shopify/Order/${orderId}` } });

        const orderRaw = response.data?.order;
        if (!orderRaw) {
            console.error(`❌ Could not fetch order gid://shopify/Order/${orderId} for fulfillment request.`);
            return new Response();
        }

        // Format for forwardOrder utility (matching REST-like structure)
        const order = {
            id: orderId,
            name: orderRaw.name,
            email: orderRaw.email,
            source_name: orderRaw.sourceName,
            shipping_address: orderRaw.shippingAddress ? {
                address1: orderRaw.shippingAddress.address1,
                address2: orderRaw.shippingAddress.address2,
                city: orderRaw.shippingAddress.city,
                province: orderRaw.shippingAddress.province,
                zip: orderRaw.shippingAddress.zip,
                country: orderRaw.shippingAddress.country,
                first_name: orderRaw.shippingAddress.firstName,
                last_name: orderRaw.shippingAddress.lastName,
                phone: orderRaw.shippingAddress.phone,
            } : null,
            line_items: orderRaw.lineItems.nodes.map(li => ({
                sku: li.sku,
                title: li.title,
                quantity: li.quantity
            }))
        };

        const result = await forwardOrder({ shop, order });
        if (result.success) {
            console.log(`✅ Order ${order.name} forwarded to Master. Accepting fulfillment request in Shopify...`);
            
            // Accept the request in Shopify to signal processing started
            const mutationResponse = await admin.graphql(`
                mutation fulfillmentOrderAcceptFulfillmentRequest($id: ID!, $message: String) {
                  fulfillmentOrderAcceptFulfillmentRequest(id: $id, message: $message) {
                    fulfillmentOrder { id status }
                    userErrors { field message }
                  }
                }
            `, { 
                variables: { 
                    id: fulfillmentOrder.admin_graphql_api_id, 
                    message: "Order forwarded to Master store. Processing..." 
                } 
            });

            const userErrors = mutationResponse.data?.fulfillmentOrderAcceptFulfillmentRequest?.userErrors;
            if (userErrors?.length > 0) {
                console.warn(`⚠️ Warning: Could not 'Accept' fulfillment request for ${fulfillmentOrder.admin_graphql_api_id}: ${userErrors[0].message}`);
            } else {
                console.log(`✓ Fulfillment request accepted for ${fulfillmentOrder.admin_graphql_api_id}`);
            }
        } else {
            console.warn(`⚠️ Order ${order.name} forward failed: ${result.message}`);
        }
    } catch (error) {
        console.error(`❌ Exception processing fulfillment request for ${shop}:`, error.message);
    }
  }

  return new Response();
};
