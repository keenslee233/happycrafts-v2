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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
    try {
        const { admin, session } = await authenticate.admin(request);

        // Fetch products from Shopify Admin
        const response = await admin.graphql(`
        query getProducts {
          products(first: 50) {
            nodes {
              id
              title
              handle
              descriptionHtml
              featuredImage { url }
              variants(first: 1) {
                nodes {
                  id
                  sku
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
      `);

        const resData = await response.json();
        const shopifyProducts = resData.data?.products?.nodes || [];

        // Fetch public SKUs from Convex
        const publicInventory = await convex.query(api.inventory.listPublicInventory);
        const publicSkus = new Set(publicInventory.map(i => i.sku));

        const shopName = session.shop.replace(".myshopify.com", "");
        const shopifyAdminUrl = `https://admin.shopify.com/store/${shopName}/products`;

        return { shopifyProducts, publicSkus, shopifyAdminUrl };
    } catch (error) {
        console.error("Master Catalog Auth Error:", error);
        // If auth fails in an iframe, Shopify Remix will handle the redirect, 
        // but we ensure we don't crash here.
        throw error;
    }
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType");

    if (actionType === "markPublic") {
        const productsJson = formData.get("products");
        const productsToMark = JSON.parse(productsJson);

        for (const prod of productsToMark) {
            if (!prod.sku) continue;

            // Find existing local inventory for stock level if it exists
            const existingInv = await convex.query(api.inventory.getInventoryBySku, { sku: prod.sku });

            await convex.mutation(api.inventory.upsertInventory, {
                sku: prod.sku,
                productName: prod.title,
                description: prod.description || undefined,
                imageUrl: prod.imageUrl || undefined,
                stockLevel: prod.inventoryQuantity || 0,
                quantity: prod.inventoryQuantity || 0,
                masterCostPrice: parseFloat(prod.price),
                masterStoreId: session.shop,
                isListed: existingInv?.isListed || false,
                isPublic: true,
            });
        }

        return Response.json({ success: true, message: `Successfully marked ${productsToMark.length} products as Public.` });
    }

    return Response.json({ success: false });
};

export default function MasterCatalog() {
    const { shopifyProducts = [], publicSkus = new Set(), shopifyAdminUrl } = useLoaderData();
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
        useIndexResourceState(shopifyProducts);

    const handleMarkPublic = () => {
        const selectedProds = shopifyProducts
            .filter((p) => selectedResources.includes(p.id))
            .map((p) => ({
                title: p.title,
                sku: p.variants.nodes[0]?.sku,
                price: p.variants.nodes[0]?.price,
                inventoryQuantity: p.variants.nodes[0]?.inventoryQuantity,
                description: p.descriptionHtml,
                imageUrl: p.featuredImage?.url,
            }))
            .filter(p => !!p.sku);

        fetcher.submit(
            { actionType: "markPublic", products: JSON.stringify(selectedProds) },
            { method: "POST" }
        );
    };

    const rowMarkup = shopifyProducts.map(
        ({ id, title, featuredImage, variants }, index) => {
            const sku = variants.nodes[0]?.sku || "No SKU";
            const price = variants.nodes[0]?.price || "0.00";
            const isPublic = publicSkus.has(sku);

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
                                <Thumbnail source={featuredImage?.url || ""} alt={title} size="small" />
                                <Text variant="bodyMd" fontWeight="bold">{title}</Text>
                            </BlockStack>
                        </Box>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{sku}</IndexTable.Cell>
                    <IndexTable.Cell>${price}</IndexTable.Cell>
                    <IndexTable.Cell>
                        {isPublic ? (
                            <Badge tone="success">Public</Badge>
                        ) : (
                            <Badge tone="attention">Private</Badge>
                        )}
                    </IndexTable.Cell>
                </IndexTable.Row>
            );
        }
    );

    return (
        <Frame>
            <Page
                title="Master Source Catalog"
                subtitle="Select products to make available in the Retail Marketplace"
                backAction={{ content: "Dashboard", url: "/app" }}
                primaryAction={{
                    content: "Mark as Public",
                    onAction: handleMarkPublic,
                    disabled: selectedResources.length === 0 || fetcher.state !== "idle",
                }}
                secondaryActions={[
                    {
                        content: "Manage Products in Shopify",
                        url: shopifyAdminUrl,
                        external: true,
                        icon: () => <span>↗</span>
                    }
                ]}
            >
                <Layout>
                    <Layout.Section>
                        <Card padding="0">
                            <IndexTable
                                resourceName={resourceName}
                                itemCount={shopifyProducts.length}
                                selectedItemsCount={
                                    allResourcesSelected ? "All" : selectedResources.length
                                }
                                onSelectionChange={handleSelectionChange}
                                headings={[
                                    { title: "Product" },
                                    { title: "SKU" },
                                    { title: "Original Cost" },
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
                        content={fetcher.data?.message || "Success"}
                        onDismiss={() => setToastActive(false)}
                    />
                )}
            </Page>
        </Frame>
    );
}
