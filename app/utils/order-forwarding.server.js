import { createAdminApiClient } from "@shopify/admin-api-client";

/**
 * Forwards a retail order to a wholesale master store as a draft order.
 * 
 * @param {Object} params
 * @param {string} params.shop - The retail shop domain (e.g. retail.myshopify.com)
 * @param {Object} params.order - The Shopify Order object (payload)
 * @param {Object} params.db - Prisma client instance
 * @returns {Promise<Object>} The result of the forwarding operation
 */
export async function forwardOrder({ shop, order, db }) {
    const lineItems = order.line_items || [];
    const sourceName = order.source_name || "unknown";
    console.log(`\n🔔 [DEBUG] Processing Order ${order.name} from ${shop} (Source: ${sourceName})`);

    // ── 0. CHECK: Is order already pushed? ──
    const existingPush = await db.pushedOrder.findFirst({
        where: { retailOrderId: order.id.toString(), shop }
    });
    if (existingPush) {
        return { success: false, message: `Order ${order.name} has already been pushed to Master.` };
    }

    // ── 1. CHECK: Only Retail stores forward orders ──
    const currentSession = await db.session.findFirst({ where: { shop } });
    if (currentSession?.role !== "RETAIL") {
        return { success: false, message: "Ignoring order — sender is not a Retail store." };
    }

    // ── 2. MATCH SKUs against Inventory ──
    const matchedItems = [];

    for (const item of lineItems) {
        if (!item.sku) {
            console.log(`  ⚠️ Line item "${item.title}" has no SKU — skipping`);
            continue;
        }

        const inventoryItem = await db.inventory.findUnique({
            where: { sku: item.sku }
        });

        if (!inventoryItem) {
            console.log(`  ❌ [DEBUG] No SKU Match Found: ${item.sku}`);
            continue;
        }

        console.log(`  ✅ [DEBUG] SKU Match Found: ${item.sku} ("${inventoryItem.productName}")`);

        // Deduct stock locally
        const newStock = Math.max(0, inventoryItem.stockLevel - item.quantity);
        await db.inventory.update({
            where: { sku: item.sku },
            data: { stockLevel: newStock }
        });

        matchedItems.push({
            sku: item.sku,
            title: inventoryItem.productName,
            quantity: item.quantity,
            masterCostPrice: inventoryItem.masterCostPrice || 0,
            masterStoreId: inventoryItem.masterStoreId,
        });
    }

    if (matchedItems.length === 0) {
        return { success: false, message: "No matching SKUs found — nothing to forward." };
    }

    // ── 3. GET WHOLESALE MASTER SESSION based on the first matched item's masterStoreId ──
    const targetMasterStoreId = matchedItems[0].masterStoreId;
    const wholesaleSession = await db.session.findFirst({
        where: { shop: targetMasterStoreId, role: "WHOLESALE" }
    });

    if (!wholesaleSession) {
        console.error(`❌ No WHOLESALE session found for ${targetMasterStoreId}. Cannot forward order.`);
        return { success: false, message: `No WHOLESALE session found for ${targetMasterStoreId}.` };
    }

    const draftLineItems = matchedItems.map(item => ({
        title: `${item.title} (SKU: ${item.sku})`,
        quantity: item.quantity,
        originalUnitPrice: item.masterCostPrice.toFixed(2),
    }));

    const totalAmount = matchedItems.reduce((sum, item) => sum + (item.masterCostPrice * item.quantity), 0);

    // ── 5. CREATE DRAFT ORDER ON MASTER STORE ──
    try {
        const shippingInput = order.shipping_address ? {
            shippingAddress: {
                address1: order.shipping_address.address1 || "",
                address2: order.shipping_address.address2 || "",
                city: order.shipping_address.city || "",
                province: order.shipping_address.province || "",
                country: order.shipping_address.country || "",
                zip: order.shipping_address.zip || "",
                firstName: order.shipping_address.first_name || "",
                lastName: order.shipping_address.last_name || "",
                phone: order.shipping_address.phone || "",
            },
            shippingLine: {
                title: "Standard Shipping",
                price: "0.00"
            }
        } : {};

        const draftOrderInput = {
            note: `🔄 Forwarded from Retail: ${shop}\nRetail Order: ${order.name}\nCustomer: ${order.email || "N/A"}`,
            email: order.email || undefined,
            ...shippingInput,
            lineItems: draftLineItems,
        };

        console.log(`\n📤 Creating Draft Order on Master (${wholesaleSession.shop})...`);
        const masterClient = createAdminApiClient({
            storeDomain: wholesaleSession.shop,
            apiVersion: "2026-01",
            accessToken: wholesaleSession.accessToken,
        });

        const response = await masterClient.request(`
            mutation draftOrderCreate($input: DraftOrderInput!) {
                draftOrderCreate(input: $input) {
                    draftOrder { id name }
                    userErrors { field message }
                }
            }
        `, { variables: { input: draftOrderInput } });

        const draftOrder = response.data?.draftOrderCreate?.draftOrder;
        const userErrors = response.data?.draftOrderCreate?.userErrors;

        if (userErrors?.length > 0) {
            console.error("❌ Draft Order userErrors:", JSON.stringify(userErrors, null, 2));
            await db.syncLog.create({
                data: {
                    shop, sku: "ORDER_FORWARD", status: "FAILED",
                    message: `Order ${order.name}: Draft order failed — ${userErrors[0].message}`,
                }
            });
            return { success: false, message: userErrors[0].message };
        } else if (draftOrder) {
            console.log(`✅ Draft Order created: ${draftOrder.name} (${draftOrder.id})`);

            // Create record in PushedOrders table
            await db.pushedOrder.create({
                data: {
                    retailOrderId: order.id.toString(),
                    masterDraftOrderId: draftOrder.id,
                    shop,
                    masterStoreId: wholesaleSession.shop,
                    totalItems: matchedItems.reduce((s, i) => s + i.quantity, 0),
                    totalAmount: totalAmount,
                    customerEmail: order.email || "N/A",
                    shippingCity: order.shipping_address?.city || "N/A",
                }
            });

            // Log per-SKU entries for the dashboard
            for (const matchedItem of matchedItems) {
                await db.syncLog.create({
                    data: {
                        shop, sku: matchedItem.sku, status: "BROADCAST",
                        message: `Order forwarded to Master for SKU ${matchedItem.sku} (${order.name} → ${draftOrder.name})`,
                    }
                });
            }

            // Also log the overall forward event
            await db.syncLog.create({
                data: {
                    shop, sku: "ORDER_FORWARD", status: "BROADCAST",
                    message: `Order ${order.name} → Draft ${draftOrder.name} (${matchedItems.length} item${matchedItems.length > 1 ? 's' : ''})`,
                }
            });

            return { success: true, draftOrderId: draftOrder.id, draftOrderName: draftOrder.name };
        }

        return { success: false, message: "Unknown error during draft order creation." };

    } catch (e) {
        console.error("❌ Draft Order creation EXCEPTION:", e.message);
        await db.syncLog.create({
            data: {
                shop, sku: "ORDER_FORWARD", status: "FAILED",
                message: `Order ${order.name}: Exception — ${e.message}`,
            }
        });
        return { success: false, message: e.message };
    }
}
