import { useLoaderData, useFetcher, useNavigate } from "react-router";
import {
    Page,
    Layout,
    Card,
    IndexTable,
    Text,
    BlockStack,
    Button,
    Box,
    useIndexResourceState,
    Thumbnail,
    Toast,
    Frame,
    EmptyState,
    ButtonGroup
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    
    // Fetch draft list from Convex
    const draftListRaw = await convex.query(api.importList.list, {
        shop: session.shop
    });
    
    // Map _id to id for Polaris IndexTable
    const draftList = draftListRaw.map(item => ({ ...item, id: item._id }));

    return { draftList };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    
    const actionType = formData.get("actionType");
    const sku = formData.get("sku");
    
    if (actionType === "remove" && sku) {
        await convex.mutation(api.importList.remove, {
            shop: session.shop,
            sku: sku
        });
        return Response.json({ success: true, message: `Removed product ${sku} from Import List.` });
    }

    return Response.json({ success: false, message: "Invalid action." });
};

export default function ImportList() {
    const { draftList } = useLoaderData();
    const fetcher = useFetcher();
    const importFetcher = useFetcher(); // Used for pushing to Shopify
    const navigate = useNavigate();
    
    const [toastActive, setToastActive] = useState(false);
    const [toastContent, setToastContent] = useState("");
    const [toastError, setToastError] = useState(false);

    // Watch for local remove action
    useEffect(() => {
        if (fetcher.state === "idle" && fetcher.data) {
            setToastContent(fetcher.data.message);
            setToastError(!fetcher.data.success);
            setToastActive(true);
        }
    }, [fetcher.state, fetcher.data]);

    // Watch for import action
    useEffect(() => {
        if (importFetcher.state === "idle" && importFetcher.data) {
            setToastContent(importFetcher.data.message || "Import processed.");
            setToastError(!importFetcher.data.success);
            setToastActive(true);
            
            // Just refresh data when idle to ensure list is accurate
            if (importFetcher.data.success) {
                // If we want instant UI updates, we could track state, but remix revalidation handles it
            }
        }
    }, [importFetcher.state, importFetcher.data]);

    const resourceName = {
        singular: "product",
        plural: "products",
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange } =
        useIndexResourceState(draftList);

    const handleRemove = (sku) => {
        fetcher.submit(
            { actionType: "remove", sku },
            { method: "POST" }
        );
    };

    const handlePushToStore = (sku) => {
        importFetcher.submit(
            { sku },
            { method: "POST", action: "/app/import" }
        );
    };

    const handlePushBulk = () => {
        const selectedSkus = draftList
            .filter((p) => selectedResources.includes(p.id))
            .map((p) => p.sku);

        if (selectedSkus.length === 0) return;

        importFetcher.submit(
            { skus: selectedSkus.join(",") },
            { method: "POST", action: "/app/import" }
        );
    };

    if (draftList.length === 0) {
        return (
            <Page title="Imported Products">
                <Card padding="0">
                  <EmptyState
                      heading="Your import list is empty. Explore the Marketplace to find winning products!"
                      action={{ content: "Go to Marketplace", url: "/app/marketplace" }}
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                  </EmptyState>
                </Card>
            </Page>
        );
    }

    const rowMarkup = draftList.map(
        ({ id, sku, productName, imageUrl, masterCostPrice }, index) => {
            const isImporting = importFetcher.state !== "idle" && importFetcher.formData?.get("sku") === sku;
            const isRemoving = fetcher.state !== "idle" && fetcher.formData?.get("sku") === sku;

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
                        <ButtonGroup>
                            <Button 
                                variant="primary" 
                                size="slim" 
                                onClick={() => handlePushToStore(sku)}
                                loading={isImporting}
                                disabled={isRemoving}
                            >
                                Push to Store
                            </Button>
                            <Button 
                                tone="critical" 
                                size="slim" 
                                onClick={() => handleRemove(sku)}
                                loading={isRemoving}
                                disabled={isImporting}
                            >
                                Remove
                            </Button>
                        </ButtonGroup>
                    </IndexTable.Cell>
                </IndexTable.Row>
            );
        }
    );

    return (
        <Frame>
            <Page
                title="Imported Products"
                subtitle="Review and push drafted products to your Shopify store"
                primaryAction={{
                    content: "Push Selected to Store",
                    onAction: handlePushBulk,
                    disabled: selectedResources.length === 0 || importFetcher.state !== "idle",
                    loading: importFetcher.state !== "idle",
                }}
            >
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            <IndexTable
                                resourceName={resourceName}
                                itemCount={draftList.length}
                                selectedItemsCount={
                                    allResourcesSelected ? "All" : selectedResources.length
                                }
                                onSelectionChange={handleSelectionChange}
                                headings={[
                                    { title: "Product" },
                                    { title: "SKU" },
                                    { title: "Wholesale Cost" },
                                    { title: "Actions" },
                                ]}
                            >
                                {rowMarkup}
                            </IndexTable>
                        </Card>
                    </Layout.Section>
                </Layout>

                {toastActive && (
                    <Toast
                        content={toastContent}
                        error={toastError}
                        onDismiss={() => setToastActive(false)}
                        duration={4000}
                    />
                )}
            </Page>
        </Frame>
    );
}
