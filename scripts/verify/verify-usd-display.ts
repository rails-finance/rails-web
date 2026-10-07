// verify-usd-display — the timeline's USD rule (lib/shared/usd-display.ts): a
// USD value shows beside every amount the timeline prices, stablecoins
// included, and only an amount with no price shows none. A dollar stablecoin
// off par at the event states its price beside the figure, and one more than
// DEPEG_BAND off $1 takes the caution band (ui-jobs 283).
// ----------------------------------------------------------------------------
// OFFLINE.
//
//   npx tsx --test scripts/verify/verify-usd-display.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPEG_BAND, isDollarStable, offPar, usdShown } from "@/lib/shared/usd-display";

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

test("a dollar stablecoin beyond the band states its price and takes the band", () => {
  assert.deepEqual(offPar(0.987, "USDC"), { text: "at $0.987", band: true });
  assert.deepEqual(offPar(1.012, "DAI"), { text: "at $1.012", band: true });
  assert.deepEqual(offPar(0.85, "BOLD"), { text: "at $0.850", band: true });
});

test("a dollar stablecoin off par inside the band states its price with no band", () => {
  assert.deepEqual(offPar(0.995, "USDC"), { text: "at $0.995", band: false });
  assert.deepEqual(offPar(1.004, "USDT"), { text: "at $1.004", band: false });
  assert.deepEqual(offPar(0.99, "USDC"), { text: "at $0.990", band: false }, "1% is the band's edge");
});

test("a dollar stablecoin that reads $1.000 is at par: no price, no band", () => {
  assert.equal(offPar(0.9997, "USDT"), null);
  assert.equal(offPar(1, "USDC"), null);
  assert.equal(offPar(1.0004, "GHO"), null);
});

test("no band and no price for any other token, or no price", () => {
  assert.equal(offPar(4_490, "WETH"), null);
  assert.equal(offPar(1.08, "EURC"), null, "a euro stable");
  assert.equal(offPar(1.17, "sUSDe"), null, "a dollar share");
  assert.equal(offPar(0.95, "PT-sUSDE-7MAY2026"), null, "a principal token");
  assert.equal(offPar(null, "USDC"), null);
  assert.equal(offPar(0.98, null), null);
});

test("the dollar stablecoins", () => {
  for (const s of ["USDC", "USDT", "DAI", "GHO", "LUSD", "BOLD", "crvUSD", "ebUSD", "USDaf", "BD"])
    assert.equal(isDollarStable(s), true, s);
  for (const s of ["EURC", "sDAI", "sUSDS", "stcUSD", "scrvUSD", "ysyBOLD", "syrupUSDC", "PT-USDe-7MAY2026", "WETH"])
    assert.equal(isDollarStable(s), false, s);
});
