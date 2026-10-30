// The Aave-family markdown export's "Protocol changes" rows, on Aave V3 Core
// wallet 0x8d53903625b8e839b9df4bd28b0efb1cd6b8639a (USDT collateral, WETH
// debt) and the 29 Oct freeze, block 26,301,183.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { aaveReserveChanges, bpsWords } from "../../lib/shared/aave-reserve-changes.ts";

const USDT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const FREEZE = "0x405bee93def8c9114e28a5338d03946b9d1c8e4dd6ff318973ce71723c0038bd";
const held = new Map([
  [USDT, "USDT"],
  [WETH, "WETH"],
]);
// The first touch, 29 Oct 20:57 UTC.
const SINCE = 1793307420;

const at = (block, transactionIndex, logIndex, timestamp, txHash) => ({
  block,
  transactionIndex,
  logIndex,
  timestamp,
  txHash,
});
const listing = [
  { ...at(16291100, 0, 0, 1672000000, "0xaa"), kind: "collateral", asset: USDT, ltv: 7500, lt: 7800, bonus: 10450 },
  { ...at(16291100, 0, 1, 1672000000, "0xaa"), kind: "collateral", asset: WETH, ltv: 8100, lt: 8400, bonus: 10500 },
];
// The rows the config-log answers today: CollateralConfigurationChanged only.
const served = [
  ...listing,
  { ...at(26301183, 127, 1, 1793310443, FREEZE), kind: "collateral", asset: USDT, ltv: 0, lt: 7800, bonus: 10450 },
  { ...at(26301183, 127, 7, 1793310443, FREEZE), kind: "collateral", asset: WETH, ltv: 0, lt: 8400, bonus: 10500 },
  { ...at(26305914, 231, 1, 1793367443, "0x1a58"), kind: "collateral", asset: WETH, ltv: 8100, lt: 8400, bonus: 10500 },
  // An e-mode category log is passed over.
  { ...at(26305915, 1, 0, 1793367455, "0xbb"), kind: "category", categoryId: 1, ltv: 9300, lt: 9500, bonus: 10100 },
];

test("the freeze: LTV to 0, threshold unchanged, from the served rows", () => {
  const rows = aaveReserveChanges(served, held, SINCE);
  assert.deepEqual(
    rows.map((r) => [r.symbol, r.block, r.logIndexes, r.words]),
    [
      ["USDT", 26301183, [1], "LTV 75 % → 0 %, liquidation threshold unchanged at 78 %"],
      ["WETH", 26301183, [7], "LTV 81 % → 0 %, liquidation threshold unchanged at 84 %"],
      ["WETH", 26305914, [1], "LTV 0 % → 81 %, liquidation threshold unchanged at 84 %"],
    ],
  );
  assert.equal(rows[0].txHash, FREEZE);
});

test("the freeze with ReserveFrozen and PendingLtvChanged: one row", () => {
  const rows = aaveReserveChanges(
    [
      ...listing,
      { ...at(26301183, 127, 0, 1793310443, FREEZE), kind: "pending-ltv", asset: USDT, ltv: 7500 },
      { ...at(26301183, 127, 1, 1793310443, FREEZE), kind: "collateral", asset: USDT, ltv: 0, lt: 7800, bonus: 10450 },
      { ...at(26301183, 127, 2, 1793310443, FREEZE), kind: "frozen", asset: USDT, frozen: true },
    ],
    held,
    SINCE,
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].logIndexes, [0, 1, 2]);
  assert.equal(
    rows[0].words,
    "frozen; LTV 75 % → 0 %, liquidation threshold unchanged at 78 %, 75 % LTV kept for the unfreeze",
  );
});

test("before the first touch, a listing, or a reserve not held: no row", () => {
  assert.deepEqual(aaveReserveChanges(served, held, 1793400000), []);
  assert.deepEqual(aaveReserveChanges(listing, held, 0), []);
  assert.deepEqual(aaveReserveChanges(served, new Map(), SINCE), []);
});

test("percentages print as the chart's markers do", () => {
  assert.equal(bpsWords(7800), "78 %");
  assert.equal(bpsWords(450), "4.50 %");
});
