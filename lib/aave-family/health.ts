// When an Aave-family account reads as liquidatable: a health factor below 1,
// the Pool's own rule (ValidationLogic: liquidation needs healthFactor <
// HEALTH_FACTOR_LIQUIDATION_THRESHOLD, 1e18). A factor of exactly 1 is not
// liquidatable. Pure, so scripts/test/aave-family-health.test.mjs runs it.

export const isBelowOne = (hf: number): boolean => hf < 1;
