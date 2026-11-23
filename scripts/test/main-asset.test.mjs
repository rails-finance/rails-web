// A closed account side's main asset (rails-ops ui-jobs 803): one pick for the
// listing row and the position page, the largest by value at the row's prices.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { pickMainAsset, splitSupplied } from "../../lib/shared/main-asset.ts";

const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const prices = { [WETH.toLowerCase()]: 3000, [USDC.toLowerCase()]: 1, [WBTC.toLowerCase()]: 60000 };

// The listing row's peaks and the position page's view of the same account:
// the page's view carries more fields, the same amounts and keys.
const listingRow = [
  { symbol: "USDC", key: USDC, amount: 10_000_000 },
  { symbol: "WETH", key: WETH, amount: 2_000 },
  { symbol: "WBTC", key: WBTC, amount: 50 },
];
const pageView = listingRow.map((r) => ({ ...r, amountRaw: String(r.amount), decimals: 18, address: r.key }));

test("the largest by value wins, the same asset from either surface's shape", () => {
  assert.equal(pickMainAsset(listingRow, prices).main.symbol, "USDC");
  assert.equal(pickMainAsset(pageView, prices).main.symbol, "USDC");
});

test("an unpriced asset, or one whose decimals did not load, is not a candidate", () => {
  const noUsdc = { ...prices };
  delete noUsdc[USDC.toLowerCase()];
  assert.equal(pickMainAsset(listingRow, noUsdc).main.symbol, "WETH");
  const unread = listingRow.map((r) => (r.symbol === "USDC" ? { ...r, decimalsUnread: true } : r));
  assert.equal(pickMainAsset(unread, prices).main.symbol, "WETH");
});

test("no price for any asset: no pick", () => {
  assert.equal(pickMainAsset(listingRow, {}), null);
  assert.equal(pickMainAsset(listingRow, undefined), null);
});

test("a tie keeps the side's first", () => {
  const tie = [
    { symbol: "USDC", key: USDC, amount: 3000 },
    { symbol: "WETH", key: WETH, amount: 1 },
  ];
  assert.equal(pickMainAsset(tie, prices).main.symbol, "USDC");
});

test("two markets sharing a symbol stay apart by key", () => {
  const markets = [
    { symbol: "WBTC", key: "cwbtc", amount: 1 },
    { symbol: "WBTC", key: "cwbtc2", amount: 2 },
  ];
  assert.equal(pickMainAsset(markets, { cwbtc: 60000, cwbtc2: 60000 }).main.key, "cwbtc2");
});

test("the supplied dropdown: collateral first, then the not-collateral supplies, each in order", () => {
  const peaks = ["WETH", "USDC", "WBTC", "DAI"];
  const other = new Set(["USDC", "DAI"]);
  assert.deepEqual(
    splitSupplied(peaks, (p) => other.has(p)),
    { first: ["WETH", "WBTC"], others: ["USDC", "DAI"] },
  );
  // Switches unread: one list, as given.
  assert.deepEqual(splitSupplied(peaks), { first: peaks, others: [] });
  // Every supply backed nothing: the first group is empty.
  assert.deepEqual(
    splitSupplied(["USDC"], () => true),
    { first: [], others: ["USDC"] },
  );
});

test("the pick counts the assets it passed over for want of a price or decimals", () => {
  assert.equal(pickMainAsset(listingRow, prices).skipped, 0);
  const noUsdc = { ...prices };
  delete noUsdc[USDC.toLowerCase()];
  const unread = listingRow.map((r) => (r.symbol === "WBTC" ? { ...r, decimalsUnread: true } : r));
  const out = pickMainAsset(unread, noUsdc);
  assert.equal(out.main.symbol, "WETH");
  assert.equal(out.skipped, 2);
});
