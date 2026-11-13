// Compound V2's printed year (lib/compound-v2/rate-year.ts) and the seize-share
// wording (lib/compound-v2/asset-catalog.ts, content/compound-v2/event-prose.yaml).
// rails-ops ui-jobs 630. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "yaml";
import { COMPOUND_V2_BLOCKS_PER_YEAR, compoundV2AnnualRate } from "../../lib/compound-v2/rate-year.ts";
import { compoundV2SeizeForm, compoundV2HasSeizeShare } from "../../lib/compound-v2/asset-catalog.ts";
import { jumpRateModel, whitePaperModel } from "../../lib/comptroller/rate-model.ts";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const pct2 = (f) => (f * 100).toFixed(2);

// cDAI 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643, borrowRatePerBlock at block 26,402,492.
const CDAI_PER_BLOCK = 91459164853n;

test("cDAI's per-block borrow rate prints 24.04% on 2,628,000 blocks", () => {
  assert.equal(COMPOUND_V2_BLOCKS_PER_YEAR, 5 * 60 * 24 * 365);
  assert.equal(pct2(compoundV2AnnualRate(CDAI_PER_BLOCK)), "24.04");
  assert.equal(pct2(compoundV2AnnualRate("91459164853")), "24.04");
});

test("the rate model's 2,102,400 is not the year a rate is printed over", () => {
  // On the model's constant the same read is 19.23%, the figure the page printed before.
  assert.equal(pct2((Number(CDAI_PER_BLOCK) / 1e18) * 2_102_400), "19.23");
  assert.notEqual(pct2(compoundV2AnnualRate(CDAI_PER_BLOCK)), "19.23");
  // None of the three loaders multiplies a rate by the model's blocksPerYear;
  // each states the docs' APY (lib/comptroller/apy.ts, ui-jobs 631).
  for (const f of [
    "lib/sources/chain/compound-v2-markets.ts",
    "lib/sources/chain/compound-v2-market-state.ts",
    "lib/sources/chain/compound-v2-position.ts",
  ]) {
    const src = fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /\*\s*blocksPerYear\b/, `${f} annualises on the model's blocksPerYear`);
    assert.match(src, /compoundV2Apy/, `${f} does not state the docs' APY`);
  }
});

test("the curve's terms and the printed rate share one year", () => {
  // cUSDC's jump-rate model, per block; set by the model on 2,102,400 blocks.
  const terms = { base: 0n, multiplier: 23782343987n, jump: 518455098934n, kink: 800000000000000000n };
  const m = jumpRateModel(terms, COMPOUND_V2_BLOCKS_PER_YEAR);
  near(m.multiplier, compoundV2AnnualRate(terms.multiplier));
  near(m.multiplier, 0.0625, 1e-6);
  near(m.jump, 1.3625, 1e-6);
  // A white-paper model's yearly terms on its 2,102,400 come out per block, then a year of 2,628,000.
  const wp = whitePaperModel(
    { baseRate: 20000000000000000n, multiplier: 300000000000000000n },
    { periods: COMPOUND_V2_BLOCKS_PER_YEAR, modelPeriods: 2_102_400 },
  );
  near(wp.base, 0.025);
  near(wp.multiplier, 0.375);
  assert.equal(
    whitePaperModel({ baseRate: 1n, multiplier: 1n }, { periods: COMPOUND_V2_BLOCKS_PER_YEAR, modelPeriods: null }),
    null,
  );
});

const L5 = parse(fs.readFileSync(new URL("../../content/compound-v2/event-prose.yaml", import.meta.url), "utf8")).L5;
/** A modal's detail text as the engine picks it: the first form the file has, else the plain field. */
const detail = (key, bold, form) => {
  const d = L5[key].details.find((x) => x.bold === bold);
  for (const f of form) if (typeof d[`text_${f}`] === "string") return d[`text_${f}`];
  return d.text;
};

test("a liquidation states the 2.8% share only for a collateral market that has one", () => {
  assert.equal(compoundV2HasSeizeShare("dai"), true);
  assert.equal(compoundV2HasSeizeShare("usdc"), false);
  const withShare = compoundV2SeizeForm({ eventType: "liquidation", market: "usdt", collateralMarket: "uni" });
  const without = compoundV2SeizeForm({ eventType: "liquidation", market: "dai", collateralMarket: "usdc" });
  assert.deepEqual(withShare, ["share"]);
  assert.deepEqual(without, ["no_share"]);
  assert.match(detail("liquidation", "The protocol's share", withShare), /2\.8%/);
  const no = detail("liquidation", "The protocol's share", without);
  assert.doesNotMatch(no, /2\.8%/);
  assert.match(no, /no protocol share, so the liquidator receives every seized cToken/);
  // A liquidation that names no collateral keeps the general sentence.
  assert.deepEqual(compoundV2SeizeForm({ eventType: "liquidation", market: "dai" }), []);
});

test("a seizure in cETH or cUSDC says the liquidator received every cToken; cUNI's states 2.8%", () => {
  for (const key of ["seize_out", "seize_in"]) {
    const eth = compoundV2SeizeForm({ eventType: key, market: "eth" });
    const uni = compoundV2SeizeForm({ eventType: key, market: "uni" });
    assert.deepEqual(eth, ["no_share"]);
    assert.deepEqual(uni, []);
    assert.doesNotMatch(detail(key, "One seizure, two parts", eth), /2\.8%/);
    assert.match(detail(key, "One seizure, two parts", uni), /2\.8%/);
  }
});

test("a 2020 seizure in a market that has the share now, with no burned leg, says none was taken", () => {
  const ctx = { eventType: "liquidation", market: "usdc", collateralMarket: "comp" };
  const form = compoundV2SeizeForm(ctx, ["liquidation", "seize_out"]);
  assert.deepEqual(form, ["none_taken"]);
  assert.doesNotMatch(detail("liquidation", "The protocol's share", form), /2\.8%/);
  // With the burned leg in the transaction, the share was taken.
  assert.deepEqual(compoundV2SeizeForm(ctx, ["liquidation", "seize_out", "seize_burn"]), ["share"]);
  const out = compoundV2SeizeForm({ eventType: "seize_out", market: "comp" }, ["seize_out", "liquidation"]);
  assert.deepEqual(out, ["none_taken"]);
  assert.match(detail("seize_out", "One seizure, two parts", out), /no protocol share was taken/);
});
