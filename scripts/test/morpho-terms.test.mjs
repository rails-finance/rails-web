// Morpho's rates as its docs state them, an APY compounded from the IRM's
// per-second rate, and the liquidation incentive factor (ui-jobs 628).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  lifBonusText,
  lifText,
  morphoApy,
  morphoLif,
  morphoPair,
  morphoRatePerSecondRaw,
  MORPHO_SECONDS_PER_YEAR,
} from "../../lib/morpho/terms.ts";

// USDC / cbBTC (86%) on Ethereum, market 0x64d65c9a…fcc64, read at block
// 26,402,093: the AdaptiveCurveIRM's borrowRateView returned 1,580,620,114 per
// second (WAD); utilization 86.238%, fee 0.
const RAW = 1_580_620_114n;
const U = 0.8623808687475841;
const yearly = (Number(RAW) / 1e18) * MORPHO_SECONDS_PER_YEAR;

test("the rate a year Rails held is 4.98%, an APR", () => {
  assert.equal((yearly * 100).toFixed(2), "4.98");
});

test("the docs' Borrow APY, e^(rate × 31,536,000) − 1, is 5.11%", () => {
  assert.equal((morphoApy(yearly) * 100).toFixed(2), "5.11");
});

test("the docs' Supply APY compounds borrow rate × utilization × (1 − fee): 4.39%", () => {
  assert.equal((morphoApy(yearly * U * (1 - 0)) * 100).toFixed(2), "4.39");
});

test("the raw per-second rate is recovered exactly from the rate a year", () => {
  assert.equal(morphoRatePerSecondRaw(yearly), RAW.toString());
});

test("no rate gives no APY", () => {
  assert.equal(morphoApy(null), null);
  assert.equal(morphoApy(-0.01), null);
  assert.equal(morphoApy(0), 0);
});

test("the incentive factor at 86% is 1.0438, a 4.38% bonus", () => {
  const lif = morphoLif(0.86);
  assert.equal(lifText(lif), "1.0438");
  assert.equal(lifBonusText(lif), "4.38% bonus");
  assert.equal(lifText(morphoLif(0)), "1.1500");
});

test("a market's name is the loan asset, then the collateral", () => {
  assert.equal(morphoPair("USDC", "cbBTC"), "USDC / cbBTC");
});
