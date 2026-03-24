/**
 * Shared pricing utility for applying markup rules.
 * Used by both the import action and the dashboard display.
 */

export function applyPricingRule(basePrice, rule) {
    if (!rule || !rule.enabled) return basePrice;

    let price = parseFloat(basePrice);
    if (isNaN(price)) return basePrice;

    // Apply markup
    if (rule.mode === "multiplier") {
        price = price * (rule.value || 1);
    } else if (rule.mode === "fixed") {
        price = price + (rule.value || 0);
    }

    // Apply rounding
    if (rule.rounding === ".99") {
        price = Math.floor(price) + 0.99;
    } else if (rule.rounding === ".95") {
        price = Math.floor(price) + 0.95;
    } else if (rule.rounding === ".00") {
        price = Math.ceil(price);
    }

    // Ensure non-negative and two decimals
    return Math.max(0, parseFloat(price.toFixed(2)));
}
