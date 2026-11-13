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

// ui-jobs 638: the owner's rebalance cost, split into the pool's bounty over
// the debt and the rest. wsteth-1950 (8 Nov 2026): $60.255 over 2,410.205
// fxUSD at 2.5% reconciles; wbtc-915: $46.53 over 1,331.692 fxUSD, of which
// the bounty is $33.29 and the min price's move inside the blocks the rest.
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

test("a rebalance cost that is the bounty says so", () => {
  const s = W.fxBountyWords({ paid: 60.255, bounty: 2410.2047 * 0.025, bountyRatio: 0.025, redemptions: false }, usd);
  assert.equal(s, "That difference is the pool's 2.5% bounty over the debt repaid, which the owner paid the keepers.");
});

test("a rebalance cost above the bounty names the rest", () => {
  const s = W.fxBountyWords({ paid: 46.53, bounty: 1331.692 * 0.025, bountyRatio: 0.025, redemptions: false }, usd);
  assert.match(
    s,
    /^The pool's 2\.5% bounty over the debt repaid comes to \$33, which the owner paid the keepers\. The other \$13 comes from the min price moving/,
  );
  assert.doesNotMatch(s, /of the collateral taken/);
});

test("no bounty sentence without the bounty read", () => {
  assert.equal(W.fxBountyWords({ paid: 10, bounty: null, bountyRatio: null, redemptions: false }, usd), null);
});

test("the docs' names", () => {
  assert.equal(W.FX_WORDS.ltv, "LTV");
  assert.equal(W.FX_WORDS.rebalanceLine, "Rebalance line");
  assert.equal(
    W.fxPoolPurpose("wstETH", "stETH"),
    "Positions on stETH: each locks wstETH and borrows fxUSD against it.",
  );
  assert.equal(
    W.fxCollateralUnitTip("wstETH", "stETH"),
    "The wstETH deposited, counted in stETH at the pool's wstETH to stETH rate.",
  );
});
