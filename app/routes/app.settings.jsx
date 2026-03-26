import { useState, useCallback } from "react";
import { useFetcher, useLoaderData } from "react-router";
import {
    Card,
    BlockStack,
    Text,
    Button,
    Box,
    Select,
    TextField,
    InlineStack,
    Divider,
    Badge,
    Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { api } from "../../convex/_generated/api.js";
import convex from "../db.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop: session.shop });
    const role = shopSessions[0]?.role || "RETAIL";

    const rule = await convex.query(api.pricing.getPricingRule, { shop: session.shop });

    return {
        rule: rule || {
            enabled: false,
            mode: "multiplier",
            value: 1.0,
            rounding: "none",
        },
        shop: session.shop,
        role,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);

    // Safety check: Only Retailers can save pricing rules
    const shopSessions = await convex.query(api.sessions.findSessionsByShop, { shop: session.shop });
    if (shopSessions[0]?.role !== "RETAIL") {
        return Response.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const formData = await request.formData();
    const enabled = formData.get("enabled") === "true";
    const mode = formData.get("mode") || "multiplier";
    const value = parseFloat(formData.get("value")) || 1.0;
    const rounding = formData.get("rounding") || "none";

    await convex.mutation(api.pricing.upsertPricingRule, {
        shop: session.shop,
        enabled,
        mode,
        value,
        rounding,
    });

    return Response.json({ success: true, message: "Pricing rules saved!" });
};

export default function Settings() {
    const { rule, shop, role } = useLoaderData();
    const fetcher = useFetcher();

    const [enabled, setEnabled] = useState(rule.enabled);
    const [mode, setMode] = useState(rule.mode);
    const [value, setValue] = useState(String(rule.value));
    const [rounding, setRounding] = useState(rule.rounding);

    const isSaving = fetcher.state !== "idle";
    const saved = fetcher.data?.success;

    const handleSave = () => {
        fetcher.submit(
            { enabled: String(enabled), mode, value, rounding },
            { method: "POST" }
        );
    };

    if (role === "WHOLESALE") {
        return (
            <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
                <BlockStack gap="600">
                    <div>
                        <Text variant="headingLg" as="h1">Settings</Text>
                        <Text tone="subdued">Manage your store connections and global settings.</Text>
                    </div>
                    <Card>
                        <Box padding="400">
                            <BlockStack gap="200">
                                <Text variant="headingMd">Wholesale Master Account</Text>
                                <Text>You are currently logged in as a <strong>Wholesale Master</strong>. Pricing rules and markup settings are managed by your retail partners.</Text>
                            </BlockStack>
                        </Box>
                    </Card>
                </BlockStack>
            </div>
        );
    }

    // Live preview calculation
    const examplePrice = 10.0;
    const calcPrice = (base) => {
        if (!enabled) return base;
        let result = base;
        if (mode === "multiplier") {
            result = base * (parseFloat(value) || 1);
        } else {
            result = base + (parseFloat(value) || 0);
        }
        // Apply rounding
        if (rounding === ".99") {
            result = Math.floor(result) + 0.99;
        } else if (rounding === ".95") {
            result = Math.floor(result) + 0.95;
        } else if (rounding === ".00") {
            result = Math.ceil(result);
        }
        return result;
    };

    return (
        <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
            <BlockStack gap="600">
                <div>
                    <Text variant="headingLg" as="h1">Pricing Rules</Text>
                    <Text tone="subdued">Set global markup rules that apply automatically when importing products.</Text>
                </div>

                {saved && (
                    <Banner tone="success" onDismiss={() => { }}>
                        Pricing rules saved successfully!
                    </Banner>
                )}

                {/* TOGGLE */}
                <Card>
                    <Box padding="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                                <Text variant="headingMd">Global Markup</Text>
                                <Text tone="subdued">Automatically adjust prices when importing from the Master store.</Text>
                            </BlockStack>
                            <Button
                                variant={enabled ? "primary" : "secondary"}
                                onClick={() => setEnabled(!enabled)}
                                tone={enabled ? "success" : undefined}
                            >
                                {enabled ? "✓ Enabled" : "Disabled"}
                            </Button>
                        </InlineStack>
                    </Box>
                </Card>

                {/* PRICING CONFIG */}
                <Card>
                    <Box padding="400">
                        <BlockStack gap="400">
                            <Text variant="headingMd">Markup Method</Text>

                            <InlineStack gap="400" wrap={false}>
                                <div style={{ flex: 1 }}>
                                    <Select
                                        label="Type"
                                        options={[
                                            { label: "Multiplier (e.g. 1.5x)", value: "multiplier" },
                                            { label: "Fixed Markup (e.g. +$10)", value: "fixed" },
                                        ]}
                                        value={mode}
                                        onChange={setMode}
                                        disabled={!enabled}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <TextField
                                        label={mode === "multiplier" ? "Multiplier Value" : "Markup Amount ($)"}
                                        type="number"
                                        value={value}
                                        onChange={setValue}
                                        autoComplete="off"
                                        min={mode === "multiplier" ? "0.1" : "0"}
                                        step={mode === "multiplier" ? "0.1" : "1"}
                                        prefix={mode === "fixed" ? "$" : undefined}
                                        suffix={mode === "multiplier" ? "×" : undefined}
                                        disabled={!enabled}
                                    />
                                </div>
                            </InlineStack>

                            <Select
                                label="Price Rounding"
                                options={[
                                    { label: "No rounding", value: "none" },
                                    { label: "Round to .99 (e.g. $19.99)", value: ".99" },
                                    { label: "Round to .95 (e.g. $19.95)", value: ".95" },
                                    { label: "Round up to whole (e.g. $20.00)", value: ".00" },
                                ]}
                                value={rounding}
                                onChange={setRounding}
                                disabled={!enabled}
                            />
                        </BlockStack>
                    </Box>
                </Card>

                {/* LIVE PREVIEW */}
                <Card>
                    <Box padding="400">
                        <BlockStack gap="300">
                            <Text variant="headingMd">Live Preview</Text>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr',
                                gap: '16px',
                                padding: '16px',
                                background: '#f9fafb',
                                borderRadius: '8px',
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <Text tone="subdued" variant="bodySm">Master Cost</Text>
                                    <Text variant="headingLg" as="p">${examplePrice.toFixed(2)}</Text>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <Text tone="subdued" variant="bodySm">Your Rule</Text>
                                    <Text variant="headingLg" as="p">
                                        {!enabled ? "—" : mode === "multiplier" ? `${value}×` : `+$${value}`}
                                    </Text>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <Text tone="subdued" variant="bodySm">Retail Price</Text>
                                    <Text variant="headingLg" as="p" fontWeight="bold">
                                        <span style={{ color: '#008060' }}>${calcPrice(examplePrice).toFixed(2)}</span>
                                    </Text>
                                </div>
                            </div>
                            <Text variant="bodySm" tone="subdued" alignment="center">
                                Based on a $10.00 example product
                            </Text>
                        </BlockStack>
                    </Box>
                </Card>

                {/* SAVE BUTTON */}
                <InlineStack align="end">
                    <Button variant="primary" onClick={handleSave} loading={isSaving} size="large">
                        Save Pricing Rules
                    </Button>
                </InlineStack>
            </BlockStack>
        </div>
    );
}
