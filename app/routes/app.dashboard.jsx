import { useLoaderData } from "react-router";
import {
    Page,
    Layout,
    Card,
    Text,
    BlockStack,
    Box,
    IndexTable,
    Badge,
    Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useSearchParams } from "react-router";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    // Fetch store role from Convex sessions
    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop: session.shop });
    const role = shopSessions[0]?.role || "RETAIL";

    // Fetch orders based on role using Convex
    let orders = [];
    if (role === "WHOLESALE") {
        orders = await convex.query(api.orders.listOrdersByMaster, { masterStoreId: session.shop });
    } else {
        orders = await convex.query(api.orders.listOrders, { shop: session.shop });
    }

    // Limit to 10 for dashboard
    const displayOrders = orders.slice(0, 10);
    const totalProcessed = orders.length;

    return { role, orders: displayOrders, totalProcessed };
};

export default function Dashboard() {
    const { role, orders, totalProcessed } = useLoaderData();
    const [searchParams] = useSearchParams();

    const successMessage = searchParams.get("success");
    const errorMessage = searchParams.get("error");

    const resourceName = {
        singular: "order",
        plural: "orders",
    };

    const rowMarkup = orders.map(
        ({ id, retailOrderId, masterDraftOrderId, shop, totalItems, totalAmount, customerEmail, shippingCity, createdAt }, index) => (
            <IndexTable.Row id={id.toString()} key={id} position={index}>
                <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold">#{retailOrderId.slice(-4)}</Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{role === "WHOLESALE" ? shop : "Master Store"}</IndexTable.Cell>
                <IndexTable.Cell>{customerEmail}</IndexTable.Cell>
                <IndexTable.Cell>{shippingCity}</IndexTable.Cell>
                <IndexTable.Cell>{totalItems} items</IndexTable.Cell>
                <IndexTable.Cell>${totalAmount.toFixed(2)}</IndexTable.Cell>
                <IndexTable.Cell>
                    <Badge tone="success">Pushed</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                    {new Date(createdAt).toLocaleDateString()}
                </IndexTable.Cell>
            </IndexTable.Row>
        )
    );

    return (
        <Page title="Dashboard">
            <BlockStack gap="500">
                {successMessage && (
                    <Banner tone="success" title={successMessage} onDismiss={() => { }} />
                )}
                {errorMessage && (
                    <Banner tone="critical" title="Forwarding failed" onDismiss={() => { }}>
                        <p>{errorMessage}</p>
                    </Banner>
                )}
                <Layout>
                    <Layout.Section>
                        <Card>
                            <Box padding="400">
                                <BlockStack gap="200">
                                    <Text variant="headingMd" as="h3">
                                        {role === "WHOLESALE" ? "Received Orders" : "Pushed Orders"}
                                    </Text>
                                    <Text tone="subdued">
                                        {role === "WHOLESALE"
                                            ? "Orders forwarded from your retail partners."
                                            : "Orders you've successfully pushed to the master store."}
                                    </Text>
                                    <Box paddingBlockStart="400">
                                        <IndexTable
                                            resourceName={resourceName}
                                            itemCount={orders.length}
                                            headings={[
                                                { title: "Order ID" },
                                                { title: role === "WHOLESALE" ? "Retailer" : "Destination" },
                                                { title: "Customer" },
                                                { title: "City" },
                                                { title: "Items" },
                                                { title: "Amount" },
                                                { title: "Status" },
                                                { title: "Date" },
                                            ]}
                                            selectable={false}
                                        >
                                            {rowMarkup}
                                        </IndexTable>
                                    </Box>
                                </BlockStack>
                            </Box>
                        </Card>
                    </Layout.Section>
                    <Layout.Section variant="oneThird">
                        <BlockStack gap="500">
                            <Card>
                                <Box padding="400">
                                    <BlockStack gap="100">
                                        <Text variant="bodyMd" tone="subdued">System Health</Text>
                                        <Text variant="heading2xl" as="p" color="success">100%</Text>
                                    </BlockStack>
                                </Box>
                            </Card>
                            <Card>
                                <Box padding="400">
                                    <BlockStack gap="100">
                                        <Text variant="bodyMd" tone="subdued">Total Orders Processed</Text>
                                        <Text variant="heading2xl" as="p" color="success">
                                            {totalProcessed}
                                        </Text>
                                    </BlockStack>
                                </Box>
                            </Card>
                            <Card>
                                <Box padding="400">
                                    <BlockStack gap="100">
                                        <Text variant="bodyMd" tone="subdued">Connected Stores</Text>
                                        <Text variant="heading2xl" as="p">
                                            {role === "WHOLESALE" ? "12 Retailers" : "1 Master"}
                                        </Text>
                                    </BlockStack>
                                </Box>
                            </Card>
                        </BlockStack>
                    </Layout.Section>
                </Layout>
            </BlockStack>
        </Page >
    );
}
