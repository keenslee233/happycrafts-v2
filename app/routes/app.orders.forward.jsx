import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { forwardOrder } from "../utils/order-forwarding.server";

export const loader = async ({ request }) => {
    const { admin, session } = await authenticate.admin(request);
    const url = new URL(request.url);
    const orderId = url.searchParams.get("id");

    if (!orderId) {
        return redirect("/app/dashboard?error=Missing+order+ID");
    }

    console.log(`🔍 Manual forward requested for order: ${orderId} on ${session.shop}`);

    // 1. Fetch order details from Shopify Admin API
    const response = await admin.graphql(`
        query getOrder($id: ID!) {
            order(id: $id) {
                id
                name
                email
                lineItems(first: 50) {
                    nodes {
                        title
                        sku
                        quantity
                    }
                }
                shippingAddress {
                    address1
                    address2
                    city
                    province
                    country
                    zip
                    firstName
                    lastName
                    phone
                }
            }
        }
    `, { variables: { id: orderId } });

    const graphqlOrder = (await response.json()).data?.order;

    if (!graphqlOrder) {
        return redirect("/app/dashboard?error=Order+not+found");
    }

    // 2. Map GraphQL order to the format expected by our utility (REST-like)
    const order = {
        id: graphqlOrder.id.split("/").pop(), // Numeric ID for internal DB consistency
        name: graphqlOrder.name,
        email: graphqlOrder.email,
        line_items: graphqlOrder.lineItems.nodes.map(item => ({
            title: item.title,
            sku: item.sku,
            quantity: item.quantity
        })),
        shipping_address: graphqlOrder.shippingAddress ? {
            address1: graphqlOrder.shippingAddress.address1,
            address2: graphqlOrder.shippingAddress.address2,
            city: graphqlOrder.shippingAddress.city,
            province: graphqlOrder.shippingAddress.province,
            country: graphqlOrder.shippingAddress.country,
            zip: graphqlOrder.shippingAddress.zip,
            first_name: graphqlOrder.shippingAddress.firstName,
            last_name: graphqlOrder.shippingAddress.lastName,
            phone: graphqlOrder.shippingAddress.phone,
        } : null
    };

    // 3. Call the shared forwarding utility
    const result = await forwardOrder({
        shop: session.shop,
        order
    });

    if (result.success) {
        return redirect(`/app/dashboard?success=Order+${order.name}+forwarded+successfully`);
    } else {
        return redirect(`/app/dashboard?error=${encodeURIComponent(result.message)}`);
    }
};
