// verify-usd-display — the timeline's USD rule (lib/shared/usd-display.ts): a
// USD value shows beside every amount the timeline prices, stablecoins
// included, and only an amount with no price shows none. DEPEG_BAND stays
// exported for the off-par colouring.
// ----------------------------------------------------------------------------
// OFFLINE.
//
//   npx tsx --test scripts/verify/verify-usd-display.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPEG_BAND, usdShown } from "@/lib/shared/usd-display";

test("a priced stablecoin shows its USD at par", () => {
  assert.equal(usdShown(11_826), true, "11,829 USDT at $0.9997");
  assert.equal(usdShown(1_000), true, "1,000 USDC at $1");
  assert.equal(usdShown(100), true, "100 DAI");
});

test("a priced stablecoin shows its USD off par", () => {
  assert.equal(usdShown(870), true, "USDC at $0.87");
  assert.equal(usdShown(1_137), true, "a euro stable");
});

test("any other priced token shows its USD", () => {
  assert.equal(usdShown(3_900), true, "WETH");
  assert.equal(usdShown(60_000), true, "WBTC");
  assert.equal(usdShown(1_070), true, "a dollar share above $1.01");
});

test("an amount with no price shows none", () => {
  assert.equal(usdShown(null), false);
  assert.equal(usdShown(undefined), false);
  assert.equal(usdShown(Number.NaN), false);
});

test("DEPEG_BAND stays exported at 1%", () => {
  assert.equal(DEPEG_BAND, 0.01);
});
