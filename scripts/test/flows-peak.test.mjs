// A closed account's peak value per side (rails-ops ui-jobs 803): the day the
// side's held assets summed highest, unpriced days left out, ties to the
// earliest day.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { sidePeak } from "../../lib/shared/flows-peak.ts";

const row = (side, symbol, amount, usd, price = usd / amount) => ({
  side,
  symbol,
  amount,
  usd,
  ...(price == null ? { unpriced: true } : { priced: { day: 0, series: true, price, block: 1 } }),
});

test("the largest day's sum wins, its day and rows named", () => {
  const heldAt = [
    [row("collateral", "WETH", 1, 2000), row("debt", "USDC", 500, 500)],
    [row("collateral", "WETH", 1, 2500), row("collateral", "WBTC", 0.1, 6000.4)],
    [row("collateral", "WETH", 1, 3000)],
  ];
  const { peak, unpriced } = sidePeak(heldAt, 20000, "collateral");
  assert.equal(peak.day, 20001);
  assert.equal(peak.usd, 8500.4);
  assert.deepEqual(
    peak.rows.map((r) => r.symbol),
    ["WETH", "WBTC"],
  );
  assert.deepEqual(unpriced, []);
  assert.equal(sidePeak(heldAt, 20000, "debt").peak.usd, 500);
});

test("a tie keeps the earliest day", () => {
  const heldAt = [[row("debt", "USDC", 100, 100)], [row("debt", "USDC", 100, 100)]];
  assert.equal(sidePeak(heldAt, 5, "debt").peak.day, 5);
});

test("a day with an unpriced held asset is left out and the asset named", () => {
  const heldAt = [
    [row("collateral", "WETH", 1, 2000)],
    [row("collateral", "WETH", 1, 2100), row("collateral", "XYZ", 10, 0, null)],
  ];
  const { peak, unpriced } = sidePeak(heldAt, 0, "collateral");
  assert.equal(peak.day, 0);
  assert.equal(peak.usd, 2000);
  assert.deepEqual(unpriced, ["XYZ"]);
});

test("every day unpriced: no peak", () => {
  const heldAt = [[row("collateral", "XYZ", 10, 0, null)]];
  const { peak, unpriced } = sidePeak(heldAt, 0, "collateral");
  assert.equal(peak, null);
  assert.deepEqual(unpriced, ["XYZ"]);
});

test("an empty series, or a side never held: no peak", () => {
  assert.equal(sidePeak([], 0, "collateral").peak, null);
  assert.equal(sidePeak([[row("collateral", "WETH", 1, 10)]], 0, "debt").peak, null);
});

test("keep limits the side to some assets", () => {
  const heldAt = [[row("collateral", "WETH", 1, 2000), row("collateral", "USDC", 5000, 5000)]];
  const { peak } = sidePeak(heldAt, 0, "collateral", (s) => s !== "USDC");
  assert.equal(peak.usd, 2000);
});
