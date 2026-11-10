// lib/aave-v4/config-words.ts: an Aave V4 spoke reserve's configuration
// changes in words, on rows from GET /api/aave-v4/reserve-config-log for the
// Ethereum Main spoke's USDC (Core hub) and Bluechip's USDC, trimmed.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { v4HeldLine, v4ReserveChanges } from "../../lib/aave-v4/config-words.ts";

const SPOKE = "0x94e7a5dcbe816e498b89ab752661904e2f56c485";
const HUB = "0xcca852bc40e560adc3b1cc58ca5b55638ce826c9";
const STRATEGY = "0xad88791b0f81d1fa242f637eb05bee0cbc53fe2f";
const ZERO = "0x0000000000000000000000000000000000000000";
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
const credit = (addCap, drawCap, active = true, halted = false) => ({
  addCap,
  drawCap,
  riskPremiumThreshold: "0",
  active,
  halted,
});
const flags = (frozen, receiveSharesEnabled = true) => ({
  collateralRisk: "0",
  paused: false,
  frozen,
  borrowable: true,
  receiveSharesEnabled,
});
const asset = (liquidityFee) => ({
  feeReceiver: "0xb9b0b8616f6bf6841972a52058132be08d723155",
  liquidityFee,
  irStrategy: STRATEGY,
  reinvestmentController: ZERO,
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
const held = (from = 24720000) =>
  Object.fromEntries(
    [
      "reserve-added",
      "reserve-config",
      "price-source",
      "dynamic-added",
      "dynamic-updated",
      "liquidation-config",
      "asset-config",
      "credit-line",
      "rate-curve",
    ].map((k) => [k, { table: `t_${k}`, heldFrom: from }]),
  );
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
  at(24723022, "liquidation-config", {
    targetHealthFactor: "1240000000000000000",
    healthFactorForMaxBonus: "900000000000000000",
    liquidationBonusFactor: "9000",
  }),
  at(24723024, "price-source", { source: "0x581b8bc9d6104f71ad6da1f483b67500968c5994" }, LISTING),
  at(24723024, "reserve-added", { assetId: 5, hub: HUB }, LISTING),
  at(24723024, "reserve-config", flags(false), LISTING),
  at(24723024, "dynamic-added", terms(0, "7800"), LISTING),
  at(24723145, "credit-line", credit("1250000", "1250000", false)),
  at(24770654, "credit-line", credit("1250000", "1250000", true)),
  at(25101325, "price-source", { source: "0x3f73f03aa83b2a48ed27e964ed0fdb590332095b" }),
  at(25876677, "credit-line", credit("18000000", "15000000")),
  at(26283034, "credit-line", credit("1099511627775", "36000000")),
  at(26301157, "reserve-config", flags(true)),
  at(26302505, "rate-curve", curve(500, 450)),
  at(26305337, "dynamic-added", terms(1, "0")),
  at(26305400, "dynamic-updated", terms(0, "7500")),
  at(26305722, "reserve-config", flags(false)),
  at(26305800, "reserve-config", flags(false)),
  at(26305900, "reserve-config", flags(false, false)),
];
const log = { chainId: 1, spoke: "main", hub: "core", held: held(), units: {}, notes: [], logs };
const o = { symbol: "USDC", hub: "Core", spokeAddress: SPOKE, hubAddress: HUB };
const out = v4ReserveChanges(log, o);
const words = (block, kind) => out.filter((c) => c.row.block === block && c.row.kind === kind).map((c) => c.words);

test("newest first, one entry a row", () => {
  assert.equal(out.length, logs.length);
  assert.equal(out[0].row.block, 26305900);
  assert.equal(out.at(-1).row.block, 24720899);
});

test("the first row of a kind states its values, later rows what moved", () => {
  assert.deepEqual(words(24720899, "liquidation-config"), [
    "Target health factor 1.00, health factor for the max bonus 0.00, bonus factor 0%",
  ]);
  assert.deepEqual(words(24723022, "liquidation-config"), [
    "Target health factor 1.00 → 1.24, health factor for the max bonus 0.00 → 0.90, bonus factor 0% → 90%",
  ]);
  assert.deepEqual(words(24722784, "rate-curve"), [
    "Optimal usage 92%, base rate 0%, growth before optimal 4%, growth after optimal 20%",
  ]);
  assert.deepEqual(words(26302505, "rate-curve"), ["Growth before optimal 4% → 5%, growth after optimal 20% → 4.5%"]);
  assert.deepEqual(words(24722784, "asset-config"), [
    "Liquidity fee 0% → 10%",
    "Liquidity fee 0%, rate strategy set, fee receiver set",
  ]);
});

test("credit line: caps in tokens, no cap at 2^40 − 1, the line's switches", () => {
  assert.deepEqual(words(24723022, "credit-line"), [
    "Add cap 1,250,000 USDC, draw cap 1,250,000 USDC, risk premium threshold 0%, line on",
  ]);
  assert.deepEqual(words(24723145, "credit-line"), ["Line off"]);
  assert.deepEqual(words(24770654, "credit-line"), ["Line on"]);
  assert.deepEqual(words(25876677, "credit-line"), [
    "Add cap 1,250,000 → 18,000,000 USDC, draw cap 1,250,000 → 15,000,000 USDC",
  ]);
  assert.deepEqual(words(26283034, "credit-line"), [
    "Add cap 18,000,000 USDC → no cap, draw cap 15,000,000 → 36,000,000 USDC",
  ]);
});

test("spoke rows: listing, flags, price source, collateral terms", () => {
  assert.deepEqual(words(24723024, "reserve-added"), ["Listed, drawn from the Core hub"]);
  assert.deepEqual(words(24723024, "reserve-config"), [
    "Collateral risk 0%, borrowing on, liquidators may take seized collateral as supplied shares",
  ]);
  assert.deepEqual(words(24723024, "price-source"), ["Price source set"]);
  assert.deepEqual(words(25101325, "price-source"), ["Price source changed"]);
  assert.deepEqual(words(24723024, "dynamic-added"), [
    "Collateral factor 78%, max liquidation bonus 5%, liquidation fee 10%",
  ]);
  assert.deepEqual(words(26305337, "dynamic-added"), [
    "Collateral factor 78% → 0%; open positions keep their terms until they next borrow, withdraw or switch collateral",
  ]);
  assert.deepEqual(words(26305400, "dynamic-updated"), ["Rewrites an earlier set: collateral factor 78% → 75%"]);
  assert.deepEqual(words(26301157, "reserve-config"), ["Frozen"]);
  assert.deepEqual(words(26305722, "reserve-config"), ["Unfrozen"]);
  assert.deepEqual(words(26305800, "reserve-config"), [
    "Collateral risk 0%, borrowing on, liquidators may take seized collateral as supplied shares restated",
  ]);
  assert.deepEqual(words(26305900, "reserve-config"), ["Liquidators take seized collateral as tokens only"]);
});

test("each row names its side and contract; the curve's is the hub's strategy", () => {
  const by = (block, kind) => out.find((c) => c.row.block === block && c.row.kind === kind);
  assert.deepEqual(by(24723024, "reserve-added").contract, { role: "spoke", address: SPOKE });
  assert.equal(by(24723024, "reserve-added").side, "spoke");
  assert.deepEqual(by(24723022, "credit-line").contract, { role: "hub", address: HUB });
  assert.equal(by(24723022, "credit-line").event, "UpdateSpokeConfig");
  // The listing's curve comes before its asset-config in the same transaction.
  assert.deepEqual(by(24722784, "rate-curve").contract, { role: "strategy", address: STRATEGY });
  assert.deepEqual(by(26302505, "rate-curve").contract, { role: "strategy", address: STRATEGY });
});

test("held line: every kind held, a kind missing, a kind starting later", () => {
  const names = { spoke: "Main", hub: "Core" };
  assert.equal(v4HeldLine(log, names), "Every change is held from the start of the Main spoke and the Core hub.");
  const missing = { ...log, held: { ...held(), "rate-curve": null } };
  assert.equal(
    v4HeldLine(missing, names),
    "Rate curve changes are not held; the rest from the start of the Main spoke and the Core hub.",
  );
  const later = { ...log, held: { ...held(), "price-source": { table: "t", heldFrom: 26000000 } } };
  assert.equal(
    v4HeldLine(later, names, (b) => (b === 26000000 ? "1 Nov 2026" : null)),
    "Price source changes are held from 1 Nov 2026; the rest from the start of the Main spoke and the Core hub.",
  );
});
