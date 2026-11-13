// lib/fx/statement-words.ts (rails-ops ui-jobs 637): the keepers' bonus is
// stated over the debt repaid (getRebalanceRatios on the wstETH pool: 88% and
// 25,000,000 at 1e9 = 2.5%); each pool's anchor is stated by its parts from
// the catalog; funding reads as off at a rate of 0 (block 26,403,000) and as
// charged at a positive rate (4.34% a year at block 26,050,000).
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";

const W = await import("../../lib/fx/statement-words.ts");
const { FX_POOLS } = await import("../../lib/fx/asset-catalog.ts");

test("the bonus is stated over the debt repaid", () => {
  const s = W.fxBonusClause(0.025, 0.04);
  assert.equal(s, "2.5% over the debt repaid on a rebalance, 4% on a liquidation");
  assert.doesNotMatch(s, /collateral/);
});

test("each pool's anchor comes from its catalog entry", () => {
  assert.equal(
    W.fxAnchorSentence(FX_POOLS.wsteth.anchor),
    "The anchor is a Curve stETH/ETH moving average multiplied by Chainlink's ETH/USD price.",
  );
  assert.equal(
    W.fxAnchorSentence(FX_POOLS.wbtc.anchor),
    "The anchor is Chainlink's WBTC/BTC and BTC/USD prices multiplied.",
  );
  assert.equal(
    W.fxPoolAnchorSentence("WBTC", FX_POOLS.wbtc.anchor),
    "The WBTC pool's anchor is Chainlink's WBTC/BTC and BTC/USD prices multiplied.",
  );
  // wstETH's parts were reproduced on chain; WBTC's are the docs'.
  assert.equal(FX_POOLS.wsteth.anchor.basis.kind, "chain");
  assert.match(W.fxAnchorBasis(FX_POOLS.wsteth.anchor), /^At block 26,403,000, .*price_oracle\(\)/);
  assert.equal(FX_POOLS.wbtc.anchor.basis.kind, "docs");
  assert.match(W.fxAnchorBasis(FX_POOLS.wbtc.anchor), /^These parts are as f\(x\)'s docs give them/);
});

test("funding at a rate of 0 reads as not charged now", () => {
  assert.equal(W.fxFundingNowText(0), "No funding is charged now: the rate is 0.00% a year.");
  assert.match(W.fxFundingTip(0), /none now/);
});

test("funding at a positive rate reads as charged now at that rate", () => {
  const s = W.fxFundingNow(0.043439442444443165);
  assert.equal(s.figure, "4.34%");
  assert.equal(
    W.fxFundingNowText(0.043439442444443165),
    "Funding is charged on every position's collateral now, at 4.34% a year.",
  );
  assert.match(W.fxFundingTip(0.0434), /charged now at Aave's USDC borrow rate/);
  // A rate too small for two places still reads as charged.
  assert.equal(W.fxFundingNow(0.00001).figure, "under 0.01%");
});

test("the rule names the docs' condition, the rate and the off state once", () => {
  assert.match(W.FX_FUNDING_RULE, /^By f\(x\)'s docs, /);
  assert.match(W.FX_FUNDING_RULE, /Aave's USDC borrow rate/);
  assert.match(W.FX_FUNDING_RULE, /Stability Pool is short of USDC/);
  assert.match(W.FX_FUNDING_RULE, /0% otherwise\.$/);
  assert.ok(W.FX_FUNDING_RULE.split(/\s+/).length <= 25);
});
