// lib/aave-v4/config-explain.ts: an Aave V4 spoke reserve's configuration
// changes explained, one row at a time, on rows trimmed from
// GET /api/aave-v4/reserve-config-log for the Ethereum Main spoke's USDC.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compactFigure } from "../../lib/shared/compact-figure.ts";
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
  at(24720899, "liquidation-config", {
    targetHealthFactor: "1000000000000000000",
    healthFactorForMaxBonus: "0",
    liquidationBonusFactor: "0",
  }),
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
  at(26340000, "reserve-config", flags(false)),
  at(26341000, "dynamic-added", {
    key: 2,
    collateralFactor: "500",
    maxLiquidationBonus: "10400",
    liquidationFee: "1000",
  }),
  at(26342000, "reserve-config", { ...flags(false), borrowable: false }),
];
const log = { chainId: 1, spoke: "main", hub: "core", held: {}, units: {}, notes: [], logs };
const changes = v4ReserveChanges(log, { symbol: "USDC", hub: "Core", spokeAddress: "0xs", hubAddress: "0xh" });
const n = { symbol: "USDC", spoke: "Main", hub: "Core", compact: compactFigure };
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
  assert.equal(head(25552732, "credit-line"), "Credit line on, caps raised|1.25M → 15M USDC");
  assert.equal(head(25876677, "credit-line"), "Supply cap raised|15M → 18M USDC");
  assert.equal(head(26301157, "reserve-config"), "Frozen|");
  assert.equal(head(26305337, "dynamic-added"), "Collateral factor lowered|78% → 0%");
  assert.equal(head(26337526, "credit-line"), "Borrow cap raised|15M → 40M USDC");
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
    "The borrow cap is the most USDC borrowers on Main can owe the Core hub, in total.",
    "Raising the borrow cap by 25M, to 40M USDC, adds that much room for borrowing on Main.",
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

test("a setting's figure keeps its value to two places, no trailing zeros", () => {
  assert.equal(compactFigure(1_250_000), "1.25M");
  assert.equal(compactFigure(40_000_000), "40M");
  assert.equal(compactFigure(12_500_000), "12.5M");
  assert.equal(compactFigure(375_000), "375K");
  assert.equal(compactFigure(2_600_000_000), "2.6B");
  assert.equal(compactFigure(999_999), "1M");
});

test("a first reserve-config row states its values, then what collateral risk does", () => {
  assert.deepEqual(at1(24723024, "reserve-config").bullets, [
    "Main lends USDC: borrowing is on.",
    "USDC's collateral risk on Main is 0%.",
    "A liquidator may take seized USDC as USDC supplied on Main, earning interest, in place of the tokens.",
    "Collateral risk sets the premium a borrower pays on top of the borrow rate when USDC backs the loan.",
  ]);
});

test("the spoke's first liquidation settings are its defaults", () => {
  const first = changes.filter((c) => c.row.kind === "liquidation-config").at(-1);
  const e = v4ChangeExplain(first, n);
  assert.equal(e.headline, "Liquidation settings at their defaults");
  assert.equal(e.bullets[0], "Main took its default liquidation settings when it was set up.");
});

test("each change's node mark: family, direction, tone", () => {
  const m = (block, kind) => {
    const k = at1(block, kind).mark;
    return [k.glyph, k.direction ?? "", k.tone ?? ""].join("|");
  };
  assert.equal(m(24723024, "reserve-added"), "list-plus||");
  assert.equal(m(24723024, "price-source"), "radio-tower||");
  assert.equal(m(24723024, "reserve-config"), "sliders||");
  assert.equal(m(24723024, "dynamic-added"), "shield||");
  assert.equal(m(24723022, "credit-line"), "gauge||");
  assert.equal(m(24723145, "credit-line"), "unplug||caution");
  // Line on and caps raised: the first move's family.
  assert.equal(m(25552732, "credit-line"), "plug||");
  assert.equal(m(25876677, "credit-line"), "gauge|up|");
  assert.equal(m(26337526, "credit-line"), "gauge|up|");
  assert.equal(m(26301157, "reserve-config"), "snowflake||caution");
  assert.equal(m(26340000, "reserve-config"), "snowflake||");
  assert.equal(m(26342000, "reserve-config"), "unplug||caution");
  assert.equal(m(26305337, "dynamic-added"), "shield|down|");
  // The collateral factor up, the bonus down: no arrow.
  assert.equal(m(26341000, "dynamic-added"), "shield||");
  assert.equal(m(24722784, "rate-curve"), "rate||");
  assert.equal(m(26337526, "rate-curve"), "rate|up|");
  assert.equal(m(24720899, "liquidation-config"), "shield-alert||");
  const fees = changes.filter((c) => c.row.kind === "asset-config").map((c) => v4ChangeExplain(c, n).mark);
  assert.deepEqual(fees, [{ glyph: "rate", direction: "up" }, { glyph: "rate" }]);
});
