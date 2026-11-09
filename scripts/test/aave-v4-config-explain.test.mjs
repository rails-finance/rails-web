// lib/aave-v4/config-explain.ts: an Aave V4 spoke reserve's configuration
// changes explained, one row at a time, on rows trimmed from
// GET /api/aave-v4/reserve-config-log for the Ethereum Main spoke's USDC.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { v4ReserveChanges } from "../../lib/aave-v4/config-words.ts";
import { v4ChangeExplain } from "../../lib/aave-v4/config-explain.ts";

let li = 0;
const at = (block, kind, fields, tx = `0x${block.toString(16)}`) => ({
  kind,
  block,
  txIndex: 0,
  logIndex: li++,
  timestamp: 1_774_000_000 + block,
  txHash: tx,
  ...fields,
});
const credit = (addCap, drawCap, active = true) => ({
  addCap,
  drawCap,
  riskPremiumThreshold: "0",
  active,
  halted: false,
});
const flags = (frozen) => ({
  collateralRisk: "0",
  paused: false,
  frozen,
  borrowable: true,
  receiveSharesEnabled: true,
});
const asset = (liquidityFee) => ({
  feeReceiver: "0xb9b0b8616f6bf6841972a52058132be08d723155",
  liquidityFee,
  irStrategy: "0xad88791b0f81d1fa242f637eb05bee0cbc53fe2f",
  reinvestmentController: "0x0000000000000000000000000000000000000000",
});
const curve = (before, after) => ({
  optimalUsageRatio: 9200,
  baseDrawnRate: 0,
  rateGrowthBeforeOptimal: before,
  rateGrowthAfterOptimal: after,
});
const terms = (key, collateralFactor) => ({
  key,
  collateralFactor,
  maxLiquidationBonus: "10500",
  liquidationFee: "1000",
});
const LISTING = "0xlisting";
const logs = [
  at(24722784, "rate-curve", curve(400, 2000), "0xcurve"),
  at(24722784, "asset-config", asset("0"), "0xcurve"),
  at(24722784, "asset-config", asset("1000"), "0xcurve"),
  at(24723022, "credit-line", credit("1250000", "1250000")),
  at(24723024, "price-source", { source: "0x581b" }, LISTING),
  at(24723024, "reserve-added", { assetId: 5 }, LISTING),
  at(24723024, "reserve-config", flags(false), LISTING),
  at(24723024, "dynamic-added", terms(0, "7800"), LISTING),
  at(24723145, "credit-line", credit("1250000", "1250000", false)),
  at(25552732, "credit-line", credit("15000000", "15000000")),
  at(25876677, "credit-line", credit("18000000", "15000000")),
  at(26301157, "reserve-config", flags(true)),
  at(26305337, "dynamic-added", terms(1, "0")),
  at(26337526, "rate-curve", curve(500, 2000), "0xboth"),
  at(26337526, "credit-line", credit("18000000", "40000000"), "0xboth"),
];
const log = { chainId: 1, spoke: "main", hub: "core", held: {}, units: {}, notes: [], logs };
const changes = v4ReserveChanges(log, { symbol: "USDC", hub: "Core", spokeAddress: "0xs", hubAddress: "0xh" });
const compact = (v) => `${(v / 1e6).toFixed(1)}M`;
const n = { symbol: "USDC", spoke: "Main", hub: "Core", compact };
const at1 = (block, kind) =>
  v4ChangeExplain(
    changes.find((c) => c.row.block === block && c.row.kind === kind),
    n,
  );
const head = (block, kind) => {
  const e = at1(block, kind);
  return [e.headline, e.figure ?? ""].join("|");
};

test("the head names what moved, with the figure", () => {
  assert.equal(head(24723024, "reserve-added"), "Listed|");
  assert.equal(head(24723024, "price-source"), "Price source set|");
  assert.equal(head(24723145, "credit-line"), "Credit line off|");
  assert.equal(head(25552732, "credit-line"), "Credit line on, caps raised|1.3M → 15.0M USDC");
  assert.equal(head(25876677, "credit-line"), "Add cap raised|15.0M → 18.0M USDC");
  assert.equal(head(26301157, "reserve-config"), "Frozen|");
  assert.equal(head(26305337, "dynamic-added"), "Collateral factor lowered|78% → 0%");
  assert.equal(head(26337526, "credit-line"), "Draw cap raised|15.0M → 40.0M USDC");
  assert.equal(head(26337526, "rate-curve"), "Rate curve changed|");
  assert.equal(head(24722784, "rate-curve"), "Rate curve set|");
});

test("each row is read against the row before it of its kind", () => {
  const fees = changes.filter((c) => c.row.kind === "asset-config").map((c) => v4ChangeExplain(c, n));
  assert.deepEqual(
    fees.map((e) => [e.headline, e.figure]),
    [
      ["Liquidity fee raised", "0% → 10%"],
      ["Liquidity fee set", "0%"],
    ],
  );
  assert.deepEqual(fees[0].bullets, [
    "The liquidity fee is the share of borrowers' interest the Core hub keeps as a fee.",
    "At 10%, USDC suppliers on the Core hub earn 90% of the interest borrowers pay.",
  ]);
});

test("the bullets say what the setting does and what the change means", () => {
  assert.deepEqual(at1(26337526, "credit-line").bullets, [
    "The draw cap is the most USDC borrowers on Main can owe the Core hub, in total.",
    "Raising the draw cap by 25.0M, to 40.0M USDC, adds that much room for borrowing on Main.",
  ]);
  assert.ok(at1(26337526, "rate-curve").bullets.includes("At 92% usage the rate is now 5%, from 4%."));
  assert.deepEqual(at1(26305337, "dynamic-added").bullets, [
    "The collateral factor is the share of supplied USDC's value that counts toward a borrow on Main.",
    "At 0%, USDC supplied on Main backs no borrowing.",
  ]);
  assert.deepEqual(at1(26301157, "reserve-config").bullets, [
    "Freezing stops new supply and new borrowing of USDC on Main.",
    "Suppliers can still withdraw and borrowers can still repay; liquidations go on.",
  ]);
  assert.deepEqual(at1(24723145, "credit-line").bullets, [
    "While the line is off, the Core hub stops Main's USDC supplies, withdrawals, borrows and repayments.",
    "Positions on Main stay as they are until the line is back on.",
  ]);
});
