// verify-usd-display — the timeline Display rule for USD values
// (lib/shared/usd-display.ts): stablecoins off by default, other tokens on, a
// stablecoin more than 1% off $1 at the event shown anyway, and a page
// without the two switches following the one for other tokens.
// ----------------------------------------------------------------------------
// OFFLINE.
//
//   npx tsx --test scripts/verify/verify-usd-display.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { usdShown } from "@/lib/shared/usd-display";

const DEFAULTS = { showUsdStable: false, showUsdOther: true, usdSplit: true };

test("defaults: a pegged stablecoin hides its USD, another token shows it", () => {
  assert.equal(usdShown(DEFAULTS, "USDT", 11_826, "11829"), false, "11,829 USDT at $0.9997");
  assert.equal(usdShown(DEFAULTS, "usdc", 1_000, 1_000), false, "any case");
  assert.equal(usdShown(DEFAULTS, "WETH", 3_900, 1), true);
});

test("a stablecoin more than 1% off $1 shows its USD whatever the switch", () => {
  assert.equal(usdShown(DEFAULTS, "USDC", 870, 1_000), true, "USDC at $0.87");
  assert.equal(usdShown(DEFAULTS, "USDC", 991, 1_000), false, "0.9% off stays hidden");
  assert.equal(usdShown(DEFAULTS, "EURC", 1_137, 1_000), true, "a euro stable is not a dollar");
  assert.equal(usdShown(DEFAULTS, "USDC", null, 1_000), false, "no price: no depeg to show");
  assert.equal(usdShown(DEFAULTS, "USDC", 0, 0), false);
});

test("the switches", () => {
  assert.equal(usdShown({ ...DEFAULTS, showUsdStable: true }, "DAI", 100, 100), true);
  assert.equal(usdShown({ ...DEFAULTS, showUsdOther: false }, "WBTC", 60_000, 1), false);
  const off = { showUsdStable: false, showUsdOther: false, usdSplit: true };
  assert.equal(usdShown(off, "USDC", 870, 1_000), true, "a depeg still shows");
});

test("a page without the two switches follows the one for other tokens", () => {
  const single = { showUsdStable: false, showUsdOther: true, usdSplit: false };
  assert.equal(usdShown(single, "BOLD", 1_000, 1_000), true);
  assert.equal(usdShown({ ...single, showUsdOther: false }, "WETH", 3_900, 1), false);
});
