import { useLoaderData, useFetcher } from "react-router";
import {
    Page,
    Layout,
    Card,
    IndexTable,
    Badge,
    Text,
    BlockStack,
    Button,
    Box,
    useIndexResourceState,
    Thumbnail,
    Toast,
    Frame,
    EmptyState,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    // Fetch all products marked as Public from Convex
    const publicInventory = await convex.query(api.inventory.listPublicInventory);
    const publicProducts = publicInventory.map(p => ({ ...p, id: p._id }));

    // Check which ones are already imported by this shop from Convex
    const importedMappings = await convex.query(api.productMappings.listMappings, {
        retailShop: session.shop
    });
    const importedSkus = new Set(importedMappings.map(m => m.masterSku));

    // Check which ones are currently in the importList (Draft Room)
    const draftList = await convex.query(api.importList.list, {
        shop: session.shop
    });
    const draftSkus = new Set(draftList.map(d => d.sku));

    // Fetch role for UI conditioning
    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop: session.shop });
    const role = shopSessions[0]?.role || "RETAIL";

    return { 
        publicProducts, 
        importedSkus: Array.from(importedSkus), 
        draftSkus: Array.from(draftSkus),
        role
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const skus = formData.get("skus");
    
    if (!skus) {
        return Response.json({ success: false, message: "No products selected" });
    }
    
    const skuArray = skus.split(",");
    let count = 0;
    
    for (const sku of skuArray) {
        const item = await convex.query(api.inventory.getInventoryBySku, { sku });
        if (item) {
            await convex.mutation(api.importList.add, {
                shop: session.shop,
                sku: item.sku,
                productName: item.productName,
                imageUrl: item.imageUrl,
                masterCostPrice: item.masterCostPrice,
                masterStoreId: item.masterStoreId
            });
            count++;
        }
    }
    
    return Response.json({ success: true, message: `Added ${count} products to your Import List.` });
};

export default function Marketplace() {
    const { publicProducts, importedSkus, draftSkus, role } = useLoaderData();
    const fetcher = useFetcher();
    const [toastActive, setToastActive] = useState(false);

    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data?.success) {
            setToastActive(true);
        }
    }, [fetcher.state, fetcher.data]);

    const resourceName = {
        singular: "product",
        plural: "products",
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange } =
        useIndexResourceState(publicProducts);

    const handleImport = () => {
        const selectedSkus = publicProducts
            .filter((p) => selectedResources.includes(p.id))
            .map((p) => p.sku);

        if (selectedSkus.length === 0) return;

        fetcher.submit(
            { skus: selectedSkus.join(",") },
            { method: "POST" }
        );
    };

    if (publicProducts.length === 0) {
        return (
            <Page title="Marketplace">
                <EmptyState
                    heading="No products available yet"
                    action={{ content: "Refresh", onAction: () => window.location.reload() }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                    <p>Wait for the Master store to mark products as Public to see them here.</p>
                </EmptyState>
            </Page>
        );
    }

    const rowMarkup = publicProducts.map(
        ({ id, sku, productName, imageUrl, masterCostPrice }, index) => {
            const isImported = importedSkus.includes(sku);
            const isDrafted = draftSkus.includes(sku);

            return (
                <IndexTable.Row
                    id={id}
                    key={id}
                    selected={selectedResources.includes(id)}
                    position={index}
                >
                    <IndexTable.Cell>
                        <Box padding="200">
                            <BlockStack gap="200" align="center" direction="row">
                                <Thumbnail source={imageUrl || ""} alt={productName} size="small" />
                                <Text variant="bodyMd" fontWeight="bold">{productName}</Text>
                            </BlockStack>
                        </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{sku}</IndexTable.Cell>
                    <IndexTable.Cell>${masterCostPrice?.toFixed(2) || "0.00"}</IndexTable.Cell>
                    <IndexTable.Cell>
                        {isImported ? (
                            <Badge tone="success">In Store</Badge>
                        ) : (isDrafted && role === "RETAIL") ? (
                            <Badge tone="info">In Import List</Badge>
                        ) : (
                            <Badge tone="attention">Available</Badge>
                        )}
                    </IndexTable.Cell>
                </IndexTable.Row>
            );
        }
    );

    return (
        <Frame>
            <Page
                title="Retail Marketplace"
                subtitle="Browse and select products to add to your Import List"
                primaryAction={role === "RETAIL" ? {
                    content: "Add to Import List",
                    onAction: handleImport,
                    disabled: selectedResources.length === 0 || fetcher.state !== "idle",
                    loading: fetcher.state !== "idle",
                } : undefined}
            >
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            <IndexTable
                                resourceName={resourceName}
                                itemCount={publicProducts.length}
                                selectedItemsCount={
                                    allResourcesSelected ? "All" : selectedResources.length
                                }
                                onSelectionChange={handleSelectionChange}
                                headings={[
                                    { title: "Product" },
                                    { title: "SKU" },
                                    { title: "Wholesale Cost" },
                                    { title: "Status" },
                                ]}
                            >
                                {rowMarkup}
                            </IndexTable>
                        </Card>
                    </Layout.Section>
                </Layout>

                {toastActive && (
                    <Toast
                        content={fetcher.data?.message || "Import started"}
                        onDismiss={() => setToastActive(false)}
                    />
                )}
            </Page>
        </Frame>
    );
}
