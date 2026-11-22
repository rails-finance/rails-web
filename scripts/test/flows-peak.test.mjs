// A closed account's peak value per side (rails-ops ui-jobs 803): the day the
// side's held assets summed highest, unpriced days left out, ties to the
// earliest day, both sides in one pass.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { sidePeaks } from "../../lib/shared/flows-peak.ts";

const row = (side, symbol, amount, usd, price = usd / amount, asset = `0x${symbol.toLowerCase()}`) => ({
  side,
  symbol,
  asset,
  amount,
  usd,
  ...(price == null ? { unpriced: true } : { priced: { day: 0, series: true, price, block: 1 } }),
});

test("the largest day's sum wins per side, its day and rows named", () => {
  const heldAt = [
    [row("collateral", "WETH", 1, 2000), row("debt", "USDC", 500, 500)],
    [row("collateral", "WETH", 1, 2500), row("collateral", "WBTC", 0.1, 6000.4)],
    [row("collateral", "WETH", 1, 3000)],
  ];
  const { collateral, debt } = sidePeaks(heldAt, 20000);
  assert.equal(collateral.peak.day, 20001);
  assert.equal(collateral.peak.usd, 8500.4);
  assert.deepEqual(
    collateral.peak.rows.map((r) => r.symbol),
    ["WETH", "WBTC"],
  );
  assert.equal(debt.peak.usd, 500);
  assert.equal(debt.peak.day, 20000);
});

test("a tie keeps the earliest day", () => {
  const heldAt = [[row("debt", "USDC", 100, 100)], [row("debt", "USDC", 100, 100)]];
  assert.equal(sidePeaks(heldAt, 5).debt.peak.day, 5);
});

test("a day with an unpriced held asset is left out and the asset named", () => {
  const heldAt = [
    [row("collateral", "WETH", 1, 2000)],
    [row("collateral", "WETH", 1, 2100), row("collateral", "XYZ", 10, 0, null)],
  ];
  const { peak, unpriced } = sidePeaks(heldAt, 0).collateral;
  assert.equal(peak.day, 0);
  assert.equal(peak.usd, 2000);
  assert.deepEqual(unpriced, ["XYZ"]);
});

test("every day unpriced: no peak", () => {
  const { peak, unpriced } = sidePeaks([[row("collateral", "XYZ", 10, 0, null)]], 0).collateral;
  assert.equal(peak, null);
  assert.deepEqual(unpriced, ["XYZ"]);
});

test("an empty series, or a side never held: no peak", () => {
  assert.equal(sidePeaks([], 0).collateral.peak, null);
  assert.equal(sidePeaks([[row("collateral", "WETH", 1, 10)]], 0).debt.peak, null);
});

test("keep limits a side to some assets, by address", () => {
  const heldAt = [[row("collateral", "WETH", 1, 2000), row("collateral", "USDC", 5000, 5000)]];
  const { peak } = sidePeaks(heldAt, 0, { collateral: (r) => r.asset === "0xweth" }).collateral;
  assert.equal(peak.usd, 2000);
});

test("keep matching no row: no peak, the timeline's symbols named", () => {
  const heldAt = [[row("collateral", "0xa0b869", 1000, 1000)], [row("debt", "0xdac17f", 10, 10)]];
  const out = sidePeaks(heldAt, 0, { collateral: () => false, debt: () => false });
  assert.equal(out.collateral.peak, null);
  assert.deepEqual(out.collateral.unmatched, ["0xa0b869"]);
  assert.deepEqual(out.collateral.unpriced, []);
  assert.deepEqual(out.debt.unmatched, ["0xdac17f"]);
});
