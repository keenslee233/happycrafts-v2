import { useEffect, useState, useCallback, useMemo } from "react";
import { useFetcher, useLoaderData, useNavigate, redirect } from "react-router";
import { useQuery } from "convex/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
  Box,
  Divider,
  IndexTable,
  Badge,
  Toast,
  Frame,
  useIndexResourceState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { updateRetailInventory } from "../utils/retailSync.server.js";
import { createAdminApiClient } from "@shopify/admin-api-client";
import { applyPricingRule } from "../utils/pricing.server.js";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // Fetch store role from Convex sessions
  const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop: session.shop });
  const role = shopSessions[0]?.role;

  // 2. If no role, return early for onboarding
  if (!role) {
    return {
      role: null,
      shop: session.shop,
      logs: [],
      inventory: [],
      orderCount: 0,
      mappings: [],
      wholesaleShop: null,
      masterPrices: {},
      masterStock: {},
      retailPrices: {},
      pricingEnabled: false,
      pricingRule: null,
    };
  }

  // 3. Parallelize the rest of the queries now that we know we need them
  const [
    logsRaw,
    inventoryRaw,
    mappingsRaw,
    wholesaleSessions,
    pricingRule,
    pushedOrders
  ] = await Promise.all([
    convex.query(api.syncLogs.listLogs, { shop: session.shop }),
    convex.query(api.inventory.listInventory),
    convex.query(api.productMappings.listMappings, { retailShop: session.shop }),
    convex.query(api.sessions.findSessionsByRole, { role: 'WHOLESALE' }),
    convex.query(api.pricing.getPricingRule, { shop: session.shop }),
    role === "WHOLESALE" 
      ? convex.query(api.orders.listOrdersByMaster, { masterStoreId: session.shop })
      : convex.query(api.orders.listOrders, { shop: session.shop })
  ]);

  const orders = pushedOrders.slice(0, 10);
  const totalProcessed = pushedOrders.length;
  
  const logs = logsRaw.map(log => ({
    ...log,
    id: log._id,
    createdAt: new Date(log.createdAt).toISOString().substring(11, 19),
  }));

  const orderCount = pushedOrders.length;
  const inventory = inventoryRaw.map(item => ({ ...item, id: item._id }));
  const mappings = mappingsRaw.map(m => ({ ...m, id: m._id }));

  const wholesaleSession = wholesaleSessions.find(s => 
    role === 'WHOLESALE' ? s.shop === session.shop : true
  );

  // Fetch master prices and stock (single bulk query)
  let masterPrices = {};
  let masterStock = {};
  let masterConnectionStatus = 'OK';
  
  if (wholesaleSession && inventory.length > 0) {
    try {
      const wholesaleClient = createAdminApiClient({
        storeDomain: wholesaleSession.shop,
        apiVersion: "2026-01",
        accessToken: wholesaleSession.accessToken,
      });

      const skuQuery = inventory.map(i => `sku:"${i.sku}"`).join(' OR ');

      const dataResponse = await wholesaleClient.request(`
        query getVariantData($query: String!) {
          productVariants(first: 250, query: $query) {
            nodes {
              sku
              price
              inventoryQuantity
            }
          }
        }
      `, { variables: { query: skuQuery } });

      const variants = dataResponse.data?.productVariants?.nodes || [];
      for (const v of variants) {
        if (v.sku) {
          const trimmedSku = v.sku.trim();
          if (v.price && !masterPrices[trimmedSku]) masterPrices[trimmedSku] = parseFloat(v.price);
          if (v.inventoryQuantity !== undefined) masterStock[trimmedSku] = (masterStock[trimmedSku] || 0) + v.inventoryQuantity;
        }
      }
    } catch (err) {
      console.error("[Pricing Debug] Master data fetch failed:", err.message);
      masterConnectionStatus = 'ERROR';
    }
  }

  const isPricingEnabled = !!pricingRule?.enabled;
  let retailPrices = {};
  if (isPricingEnabled) {
    for (const [sku, price] of Object.entries(masterPrices)) {
      retailPrices[sku] = applyPricingRule(price, pricingRule);
    }
  }

  return {
    role,
    shop: session.shop,
    logs,
    inventory,
    orderCount,
    mappings,
    orders,
    totalProcessed,
    wholesaleShop: wholesaleSession?.shop,
    masterPrices,
    masterStock,
    retailPrices,
    pricingEnabled: isPricingEnabled,
    pricingRule,
    masterConnectionStatus
  };
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  // ----------------------------------------------------
  // HANDLE ROLE SETTING
  // ----------------------------------------------------
  if (actionType === "setRole") {
    const role = formData.get("role");
    
    // In Convex, we update the session based on the shop.
    // We already have storeSession mutation.
    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop: session.shop });
    const shopSession = shopSessions[0];

    console.log(`[Role Sync] Found ${shopSessions.length} sessions for ${session.shop}. Role to set: ${role}`);

    if (shopSession) {
        // Clean up internal Convex fields (_id, _creationTime) before mutation
        const { _id, _creationTime, ...sessionData } = shopSession;
        
        console.log(`[Role Sync] Updating existing session. Current fields: ${Object.keys(sessionData).join(', ')}`);
        
        await convex.mutation(api.sessions.storeSession, {
            ...sessionData,
            accountOwner: sessionData.accountOwner || false, // Mandatory field
            role: role || undefined
        });
    } else {
        console.warn(`[Role Sync] No session found for ${session.shop}. Creating fresh session.`);
        await convex.mutation(api.sessions.storeSession, {
            id: session.id,
            shop: session.shop,
            state: session.state,
            isOnline: session.isOnline,
            scope: session.scope,
            accessToken: session.accessToken,
            accountOwner: false, // Mandatory field
            role: role || undefined
        });
    }

    return Response.json({ success: true, role });
  }

  // ----------------------------------------------------
  // HANDLE MANUAL SYNC (Broadcast)
  // ----------------------------------------------------
  if (actionType === "sync") {
    const sku = formData.get("sku");
    const stockLevel = parseInt(formData.get("stockLevel"));
    const shop = session.shop;

    const retailPartners = await convex.query(api.sessions.findSessionsByRole, { role: "RETAIL" });

    let syncCount = 0;
    for (const partner of retailPartners) {
      if (partner.shop === shop) continue;
      await updateRetailInventory(partner.shop, partner.accessToken, sku, stockLevel);
      await convex.mutation(api.syncLogs.createLog, {
        shop: shop,
        sku: sku,
        status: "BROADCAST",
        message: `Manual Sync to ${partner.shop}`,
        createdAt: Date.now()
      });
      syncCount++;
    }

    return Response.json({ success: true, message: `Synced ${sku} to ${syncCount} stores.` });
  }

  } catch (error) {
    console.error("Action error:", error);
    return Response.json({ success: false, error: error.message });
  }
};

export default function Index() {
  const { role, shop, logs, inventory, orderCount, mappings, wholesaleShop, masterPrices, masterStock, retailPrices, pricingEnabled, pricingRule, masterConnectionStatus } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const importFetcher = useFetcher();

  // IndexTable selection
  const resourceIDResolver = (item) => String(item.id);
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(inventory, { resourceIDResolver });

  // Toast state
  const [toastActive, setToastActive] = useState(false);
  const [toastContent, setToastContent] = useState("");
  const [toastError, setToastError] = useState(false);

  // Track which SKUs were just imported (for instant UI feedback)
  const [justImported, setJustImported] = useState({});

  // 1. Fetch Real-time Data from Convex
  const convexInventory = useQuery(api.inventory.listInventory, {});
  const convexLogs = useQuery(api.syncLogs.listLogs, { shop: shop });

  // 2. Map and Combine Data (using loader data as fallback/initial state)
  const displayInventory = useMemo(() => {
    if (convexInventory) {
      return convexInventory.map(item => ({ ...item, id: item._id }));
    }
    return inventory;
  }, [convexInventory, inventory]);

  const displayLogs = useMemo(() => {
    if (convexLogs) {
      return convexLogs.map(log => ({
        ...log,
        id: log._id,
        createdAt: new Date(log.createdAt).toISOString().substring(11, 19),
      }));
    }
    return logs;
  }, [convexLogs, logs]);

  // Handle import response (single or bulk)
  useEffect(() => {
    if (importFetcher.state === "idle" && importFetcher.data) {
      if (importFetcher.data.success) {
        // Show appropriate toast
        setToastContent(importFetcher.data.message || "Product imported successfully!");
        setToastError(false);
        setToastActive(true);

        // Track imported SKUs for instant UI update
        const importResults = importFetcher.data.results || [];
        if (importResults.length > 0) {
          const newImports = {};
          for (const r of importResults) {
            if (r.success) {
              newImports[r.sku] = { handle: r.handle, productId: r.productId };
            }
          }
          setJustImported(prev => ({ ...prev, ...newImports }));
        } else if (importFetcher.data.handle) {
          // Single-import fallback
          const importedSku = importFetcher.formData?.get("sku");
          if (importedSku) {
            setJustImported(prev => ({
              ...prev,
              [importedSku]: {
                handle: importFetcher.data.handle,
                productId: importFetcher.data.productId,
              }
            }));
          }
        }
        // Refresh the main data
        fetcher.load("/");
      } else if (importFetcher.data.message) {
        setToastContent(importFetcher.data.message);
        setToastError(true);
        setToastActive(true);
      }
    }
  }, [importFetcher.state, importFetcher.data]);

  const displayOrderCount = fetcher.data?.orderCount !== undefined ? fetcher.data.orderCount : orderCount;
  const currentRole = fetcher.data?.role !== undefined ? fetcher.data.role : role;


  const handleManualSync = (sku, stockLevel) => {
    fetcher.submit({ actionType: "sync", sku, stockLevel }, { method: "POST" });
  };

  const handleImport = (sku) => {
    importFetcher.submit({ sku }, { method: "POST", action: "/app/import" });
  };

  // Bulk import handler
  const handleBulkImport = () => {
    // Map selected IDs back to SKUs
    const selectedSkus = inventory
      .filter(item => selectedResources.includes(String(item.id)))
      .filter(item => !isMapped(item.sku)) // Only import un-synced items
      .map(item => item.sku);

    if (selectedSkus.length === 0) {
      setToastContent("All selected products are already imported.");
      setToastError(true);
      setToastActive(true);
      return;
    }

    importFetcher.submit(
      { skus: selectedSkus.join(",") },
      { method: "POST", action: "/app/import" }
    );
  };

  const isMapped = (sku) => mappings?.some(m => m.masterSku === sku) || justImported[sku];

  const getMapping = (sku) => {
    const dbMapping = mappings?.find(m => m.masterSku === sku);
    if (dbMapping) return dbMapping;
    if (justImported[sku]) return justImported[sku];
    return null;
  };

  const getViewInStoreUrl = (sku) => {
    const mapping = getMapping(sku);
    if (!mapping) return null;

    // Prioritize Admin URL for Retailers
    const productId = mapping.retailProductId;
    if (productId) {
      // Handle gid://shopify/Product/123456789
      const numericId = productId.includes('/') ? productId.split('/').pop() : productId;
      const storeName = shop.replace('.myshopify.com', '');
      return `https://admin.shopify.com/store/${storeName}/products/${numericId}`;
    }

    // Fallback to storefront URL if handle exists
    if (mapping.handle) {
      return `https://${shop}/products/${mapping.handle}`;
    }

    return null;
  };

  const toastMarkup = toastActive ? (
    <Toast
      content={toastContent}
      error={toastError}
      onDismiss={() => setToastActive(false)}
      duration={4000}
    />
  ) : null;

  if (!currentRole) {
    return (
      <Frame>
        <Page narrowWidth>
          <BlockStack gap="500">
            <Text variant="headingXl" as="h1" alignment="center">Choose Your Store Role</Text>
            <Layout>
              <Layout.Section variant="oneHalf">
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400" align="center">
                      <Text variant="headingMd" as="h2">Wholesale Master</Text>
                      <Text as="p" tone="subdued">The source of truth. Inventory updates here are pushed to all retailers.</Text>
                      <fetcher.Form method="POST">
                        <input type="hidden" name="actionType" value="setRole" />
                        <input type="hidden" name="role" value="WHOLESALE" />
                        <Button variant="primary" submit loading={fetcher.state !== 'idle'}>Select Wholesale</Button>
                      </fetcher.Form>
                    </BlockStack>
                  </Box>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneHalf">
                <Card>
                  <Box padding="400">
                    <BlockStack gap="400" align="center">
                      <Text variant="headingMd" as="h2">Retail Partner</Text>
                      <Text as="p" tone="subdued">Receives updates. Inventory is automatically synced from the master store.</Text>
                      <fetcher.Form method="POST">
                        <input type="hidden" name="actionType" value="setRole" />
                        <input type="hidden" name="role" value="RETAIL" />
                        <Button submit loading={fetcher.state !== 'idle'}>Select Retail</Button>
                      </fetcher.Form>
                    </BlockStack>
                  </Box>
                </Card>
              </Layout.Section>
            </Layout>
          </BlockStack>
        </Page>
        {toastMarkup}
      </Frame>
    );
  }

  return (
    <Frame>
      <section style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <BlockStack gap="400">
          <style>{`
            .main-card {
              box-shadow: 0 4px 20px rgba(0,0,0,0.05);
              border-radius: 12px;
              overflow: hidden;
              background: #fff;
            }
            .search-bar {
              display: flex;
              gap: 12px;
              padding: 16px;
              background: #f9fafb;
              border-bottom: 1px solid #e1e3e5;
            }
            .status-pill {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: 600;
              border: 1px solid currentColor;
            }
            .status-pill.active { color: #008060; background: #e6f4ea; }
            .view-store-link {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              padding: 4px 12px;
              border-radius: 6px;
              font-size: 13px;
              font-weight: 600;
              color: #008060;
              background: #e6f4ea;
              text-decoration: none;
              transition: all 0.15s ease;
              cursor: pointer;
            }
            .view-store-link:hover {
              background: #c8ecd5;
              color: #006e52;
            }
            .view-store-link {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 4px;
            }
            .Polaris-IndexTable__TableRow {
              cursor: default !important;
            }
            .Polaris-IndexTable__TableCell .view-store-link,
            .Polaris-IndexTable__TableCell button,
            .Polaris-IndexTable__TableCell .Polaris-Checkbox__Input {
              cursor: pointer !important;
            }
          `}</style>

          <div>
            <Text variant="headingXl" as="h1">Dashboard</Text>
            <Text tone="subdued">Overview of your synced inventory and recent orders.</Text>
          </div>

          {/* DASHBOARD ORDERS SECTION */}
          {(currentRole === "RETAIL" || currentRole === "WHOLESALE") && (
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3">
                    {currentRole === "WHOLESALE" ? "Recent Wholesale Orders" : "Recent Direct Orders"}
                  </Text>
                  <IndexTable
                    resourceName={{ singular: 'order', plural: 'orders' }}
                    itemCount={orders.length}
                    headings={[
                      { title: "Order ID" },
                      { title: currentRole === "WHOLESALE" ? "Retailer" : "Destination" },
                      { title: "Customer" },
                      { title: "Items" },
                      { title: "Amount" },
                      { title: "Status" },
                      { title: "Date" },
                    ]}
                    selectable={false}
                  >
                    {orders.map((order, index) => (
                      <IndexTable.Row id={order._id} key={order._id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">#{order.retailOrderId.slice(-4)}</Text></IndexTable.Cell>
                        <IndexTable.Cell>{currentRole === "WHOLESALE" ? order.shop : "Master Store"}</IndexTable.Cell>
                        <IndexTable.Cell>{order.customerEmail || "N/A"}</IndexTable.Cell>
                        <IndexTable.Cell>{order.totalItems} items</IndexTable.Cell>
                        <IndexTable.Cell>${order.totalAmount?.toFixed(2)}</IndexTable.Cell>
                        <IndexTable.Cell><Badge tone="success">Processed</Badge></IndexTable.Cell>
                        <IndexTable.Cell>{new Date(order.createdAt).toLocaleDateString()}</IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                  {orders.length === 0 && (
                    <Box padding="400" align="center">
                      <Text tone="subdued">No orders found.</Text>
                    </Box>
                  )}
                </BlockStack>
              </Box>
            </Card>
          )}

          <Divider />

          <div>
            <Text variant="headingMd" as="h2">Inventory Sync Status</Text>
            <Text tone="subdued">Monitor live stock levels and pricing rules across connected stores.</Text>
          </div>

          {currentRole === "WHOLESALE" && (
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Master Control</Text>
                <Text as="p" tone="subdued">Browse your Shopify products and list them on the global app catalog for all retailers to see.</Text>
                <div>
                  <Button variant="primary" onClick={() => navigate("/app/master-catalog")}>Manage Global Catalog</Button>
                </div>
              </BlockStack>
            </Card>
          )}

          {currentRole === "RETAIL" && masterConnectionStatus === "UNAUTHORIZED" && (
            <Banner
              title="Master Store Connection Disconnected"
              tone="critical"
            >
              <p>The Master store ({wholesaleShop}) access token has expired or is invalid. To resume operations, the Master store administrator must open this app in their Shopify admin panel to re-authenticate.</p>
            </Banner>
          )}

          {currentRole === "RETAIL" && masterConnectionStatus === "ERROR" && (
            <Banner title="Master Store Connection Error" tone="warning">
              <p>Failed to retrieve live prices and stock levels from the Master store. The backend might be experiencing issues.</p>
            </Banner>
          )}

          {currentRole === "RETAIL" && !pricingEnabled && (
            <Banner
              title="Global Pricing Rules are Currently Disabled"
              tone="warning"
              action={{
                content: "Configure Pricing",
                url: "/app/settings",
              }}
            >
              <p>Your estimated retail prices and margins are hidden. Enable pricing rules in settings to see them on the dashboard and apply markups automatically during import.</p>
            </Banner>
          )}

          <div className="main-card">
            <Card padding="0">
              <div className="search-bar">
                <div style={{ flex: 1, position: 'relative' }}>
                  <input type="text" placeholder="Search by product name..." style={{ width: '100%', padding: '10px 16px', borderRadius: '8px', border: '1px solid #e1e3e5', outline: 'none' }} />
                </div>
                <Button variant="primary">Connect new store</Button>
              </div>

              <IndexTable
                resourceName={{ singular: 'product', plural: 'products' }}
                itemCount={displayInventory.length}
                selectedItemsCount={
                  allResourcesSelected ? 'All' : selectedResources.length
                }
                onSelectionChange={handleSelectionChange}
                headings={[
                  { title: 'Product' },
                  { title: 'Status' },
                  { title: 'Master Cost' },
                  ...(currentRole === 'RETAIL' && pricingEnabled ? [{ title: 'Your Price' }] : []),
                  { title: 'Stock' },
                  { title: 'Actions', alignment: 'end' }
                ]}
                selectable={currentRole === 'RETAIL'}
                promotedBulkActions={
                  currentRole === 'RETAIL' ? [
                    {
                      content: importFetcher.state !== 'idle' ? 'Importing...' : `Import ${selectedResources.length} to Store`,
                      onAction: handleBulkImport,
                      disabled: importFetcher.state !== 'idle',
                    },
                  ] : []
                }
              >
                {displayInventory.map(({ id, sku, productName, stockLevel, masterCostPrice }, index) => {

                  const mapped = isMapped(sku);
                  const isImporting = importFetcher.state !== "idle" && importFetcher.formData?.get("sku") === sku;
                  const viewUrl = mapped ? getViewInStoreUrl(sku) : null;

                  return (
                    <IndexTable.Row
                      id={String(id)}
                      key={id}
                      position={index}
                      selected={selectedResources.includes(String(id))}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IndexTable.Cell>
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="bold">{productName}</Text>
                          <Text variant="bodySm" tone="subdued">SKU: {sku}</Text>
                        </BlockStack>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <div className={`status-pill ${mapped || currentRole === 'WHOLESALE' ? 'active' : ''}`}>
                          {mapped || currentRole === 'WHOLESALE' ? '● Active' : '○ Standby'}
                        </div>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {(() => {
                          const livePrice = masterPrices[sku.trim()];
                          const displayPrice = livePrice || masterCostPrice;
                          if (displayPrice) {
                            return <Text variant="bodyMd" tone="subdued">${displayPrice.toFixed(2)}</Text>;
                          }
                          return <Text variant="bodySm" tone="subdued">—</Text>;
                        })()}
                      </IndexTable.Cell>
                      {currentRole === 'RETAIL' && pricingEnabled && (
                        <IndexTable.Cell>
                          {retailPrices[sku] ? (
                            <BlockStack gap="050">
                              <Text variant="bodyMd" fontWeight="bold">
                                <span style={{ color: '#008060' }}>${retailPrices[sku].toFixed(2)}</span>
                              </Text>
                              {masterPrices[sku] && (
                                <Text variant="bodySm" tone="success">
                                  +${(retailPrices[sku] - masterPrices[sku]).toFixed(2)} margin
                                </Text>
                              )}
                            </BlockStack>
                          ) : (
                            <Text variant="bodySm" tone="subdued">—</Text>
                          )}
                        </IndexTable.Cell>
                      )}
                      <IndexTable.Cell>
                        {currentRole === 'WHOLESALE' ? (
                          <Badge tone={(masterStock[sku.trim()] || 0) > 0 ? "success" : "critical"}>
                            {masterStock[sku.trim()] !== undefined ? masterStock[sku.trim()] : 0} in Shopify
                          </Badge>
                        ) : (
                          <BlockStack gap="050">
                            <Badge tone={stockLevel > 0 ? "success" : "critical"}>
                              {stockLevel} in store
                            </Badge>
                            {!mapped && masterStock[sku.trim()] !== undefined && (
                              <Text variant="bodySm" tone="subdued">
                                {masterStock[sku.trim()]} available at master
                              </Text>
                            )}
                          </BlockStack>
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                          {currentRole === 'WHOLESALE' ? (
                            <Button size="slim" onClick={() => handleManualSync(sku, stockLevel)} loading={fetcher.state === "submitting" && fetcher.formData?.get("sku") === sku}>
                              Broadcast Stock
                            </Button>
                          ) : (
                            mapped ? (
                              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <Badge tone="success">Synced</Badge>
                                {viewUrl && (
                                  <a
                                    href={viewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="view-store-link"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    View in Store →
                                  </a>
                                )}
                              </div>
                            ) : (
                              <Button
                                size="slim"
                                variant="primary"
                                onClick={() => handleImport(sku)}
                                loading={isImporting}
                              >
                                {isImporting ? 'Importing...' : 'Import to Store'}
                              </Button>
                            )
                          )}
                          <Button size="slim" icon={() => <span>⋮</span>} />
                        </div>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            </Card>
          </div>

          {/* RECENT ACTIVITY SECTION */}
          <Layout>
            <Layout.Section variant="oneHalf">
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text variant="headingMd">Recent Activity</Text>
                    {displayLogs.length > 0 ? (
                      displayLogs.map((log) => (
                        <Box key={log.id} padding="300" borderBlockEndWidth="025" borderColor="border">
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="bold">
                              {log.sku === 'ORDER_FORWARD' ? '📦' : log.status === 'SUCCESS' ? '✅' : '🔄'} {log.sku}
                            </Text>
                            <Text variant="bodySm" tone="subdued">{log.message}</Text>
                          </BlockStack>
                        </Box>
                      ))
                    ) : (
                      <Text tone="subdued">No activity yet.</Text>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>
            <Layout.Section variant="oneHalf">
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text variant="headingMd">Performance</Text>
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack align="center">
                        <Text variant="heading2xl">{displayOrderCount || 0}</Text>
                        <Text tone="subdued">Total Orders Processed</Text>
                      </BlockStack>
                    </Box>
                    <Box paddingBlockStart="200">
                      <fetcher.Form method="POST">
                        <input type="hidden" name="actionType" value="setRole" />
                        <input type="hidden" name="role" value="" />
                        <Button variant="plain" tone="critical" submit loading={fetcher.state !== 'idle'}>Reset Role</Button>
                      </fetcher.Form>
                    </Box>
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </section>
      {toastMarkup}
    </Frame>
  );
}
