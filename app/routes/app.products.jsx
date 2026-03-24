import { BlockStack, Text } from "@shopify/polaris";

export default function Products() {
    return (
        <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%', textAlign: 'center' }}>
            <BlockStack gap="400">
                <div style={{ fontSize: '48px' }}>📦</div>
                <Text variant="headingLg" as="h2">Products Catalog</Text>
                <Text tone="subdued">Manage your synced products and master inventory definitions.</Text>
            </BlockStack>
        </div>
    );
}
