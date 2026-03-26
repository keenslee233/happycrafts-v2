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

    return { publicProducts, importedSkus };
};

export default function Marketplace() {
    const { publicProducts, importedSkus } = useLoaderData();
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
            { method: "POST", action: "/app/import" }
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
            const isImported = importedSkus.has(sku);

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
                            <Badge tone="success">Imported</Badge>
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
                subtitle="Browse and import products from the Master Source"
                primaryAction={{
                    content: "Import Selected",
                    onAction: handleImport,
                    disabled: selectedResources.length === 0 || fetcher.state !== "idle",
                    loading: fetcher.state !== "idle",
                }}
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
