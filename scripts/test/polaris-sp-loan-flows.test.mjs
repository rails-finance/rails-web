// The Lifetime flows legs of a Polaris stability-pool deposit and a reserve
// loan (lib/polaris/sp-loan-math.ts: depositLegs, loanLegs, loanChainAgrees),
// which lib/polaris/sp-loan-flow-timelines.ts draws as the panel's bars.
// Fixtures: USDp deposit #35's first twelve operations and loan 63's four
// touches, read from the index on 17 Nov 2026.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { depositLegs, loanChainAgrees, loanLegs } from "../../lib/polaris/sp-loan-math.ts";

const ZERO = BigInt(0);
const B = (v) => BigInt(v);

const DEPOSIT_35 = [
  ["200000000000000000", "0", "0", "0", "0", "0", "200000000000000000", "0"],
  ["200000000000000000", "0", "617703279661", "617703279661", "0", "0", "400000000000000000", "0"],
  ["200000000000000000", "0", "800136521471", "800136521471", "0", "0", "600000000000000000", "0"],
  ["200000000000000000", "0", "29021415191683", "29021415191683", "0", "0", "800000000000000000", "0"],
  ["200000000000000000", "0", "54865272043515", "54865272043515", "0", "0", "1000000000000000000", "0"],
  ["200000000000000000", "0", "108149004822093", "108149004822093", "0", "0", "1200000000000000000", "0"],
  ["200000000000000000", "0", "308018995214804", "308018995214804", "0", "0", "1400000000000000000", "0"],
  ["200000000000000000", "0", "108678209443611", "108678209443611", "0", "0", "1600000000000000000", "0"],
  ["200000000000000000", "0", "350134103623093", "350134103623093", "0", "0", "1800000000000000000", "0"],
  ["200000000000000000", "0", "543537599351856", "543537599351856", "0", "0", "2000000000000000000", "0"],
  [
    "200000000000000000",
    "398574530037193",
    "295418375323541",
    "295418375323541",
    "65460649628",
    "65460649628",
    "2199601425469962807",
    "0",
  ],
  ["200000000000000000", "0", "56902553008574", "56902553008574", "0", "0", "2399601425469962807", "0"],
].map(
  ([
    top_up_or_withdrawal,
    deposit_loss,
    stable_gain_since,
    stable_gain_claimed,
    bc_gain_since,
    bc_gain_claimed,
    new_deposit,
    stashed_bc_tokens,
  ]) => ({
    top_up_or_withdrawal,
    deposit_loss,
    stable_gain_since,
    stable_gain_claimed,
    bc_gain_since,
    bc_gain_claimed,
    new_deposit,
    stashed_bc_tokens,
  }),
);

// A withdrawal that keeps part of the yield and stashes the pETH, then a
// claim of the stash: the two sides the fixture does not reach.
const LATER = [
  {
    top_up_or_withdrawal: "-400000000000000000",
    deposit_loss: "1000",
    stable_gain_since: "5000",
    stable_gain_claimed: "2000",
    bc_gain_since: "700",
    bc_gain_claimed: "0",
    new_deposit: "1999601425469964807",
    stashed_bc_tokens: "700",
  },
  {
    top_up_or_withdrawal: "0",
    deposit_loss: "0",
    stable_gain_since: "0",
    stable_gain_claimed: "0",
    bc_gain_since: "300",
    bc_gain_claimed: "1000",
    new_deposit: "1999601425469964807",
    stashed_bc_tokens: "0",
  },
];

test("each operation's legs carry the deposit and the stash from the one before", () => {
  let deposit = ZERO;
  let stash = ZERO;
  for (const r of [...DEPOSIT_35, ...LATER]) {
    const g = depositLegs(r);
    assert.equal(deposit + g.deposited + g.yieldIn - g.withdrawn - g.burned - g.yieldClaimed, g.deposit);
    assert.equal(stash + g.pethIn - g.pethClaimed, g.stash);
    deposit = g.deposit;
    stash = g.stash;
  }
});

test("over a life the deposit's bar sums to the deposit, the pETH bar to the stash", () => {
  const legs = [...DEPOSIT_35, ...LATER].map(depositLegs);
  const sum = (k) => legs.reduce((a, g) => a + g[k], ZERO);
  const last = legs[legs.length - 1];
  assert.equal(
    sum("deposited") + sum("yieldIn") - sum("withdrawn") - sum("burned") - sum("yieldClaimed"),
    last.deposit,
  );
  assert.equal(sum("pethIn") - sum("pethClaimed"), last.stash);
  // The burned row: liquidations used 0.000398… USDp and paid 65460649628 wei of pETH.
  assert.equal(legs[10].burned, B("398574530037193"));
  assert.equal(legs[10].pethIn, B("65460649628"));
  assert.equal(legs[12].withdrawn, B("400000000000000000"));
});

const LOAN_63 = [
  ["1000000000000000000", "1260301649662357011", "1000000000000000000", "1260301649662357011"],
  ["200000000000000000", "0", "1200000000000000000", "1260301649662357011"],
  ["0", "277454050151666939", "1200000000000000000", "1537861195175130827"],
  ["0", "-25000000000000000", "1200000000000000000", "1514224488545736950"],
].map(([coll_change, debt_change, coll_after, debt_after]) => ({ coll_change, debt_change, coll_after, debt_after }));

test("each touch's fee is the debt after it, less the debt before and its change", () => {
  const legs = loanLegs(LOAN_63);
  assert.deepEqual(
    legs.map((g) => g.fee.toString()),
    ["0", "0", "105495361106877", "1363293370606123"],
  );
  const sum = (k) => legs.reduce((a, g) => a + g[k], ZERO);
  assert.equal(sum("borrowed") + sum("fee") - sum("repaid"), legs[3].debt);
  assert.equal(sum("collIn") - sum("collOut"), legs[3].coll);
});

test("a touch a wei under the debt before books no fee, and the next fee pays the wei back", () => {
  const touches = [
    { coll_change: "10", debt_change: "1000", coll_after: "10", debt_after: "1000" },
    // ceil(shares × index) after a repay of 100 lands a wei under 900.
    { coll_change: "0", debt_change: "-100", coll_after: "10", debt_after: "899" },
    { coll_change: "0", debt_change: "0", coll_after: "10", debt_after: "905" },
  ];
  const legs = loanLegs(touches);
  assert.deepEqual(
    legs.map((g) => g.fee.toString()),
    ["0", "0", "5"],
  );
  const sum = (k) => legs.reduce((a, g) => a + g[k], ZERO);
  assert.equal(sum("borrowed") + sum("fee") - sum("repaid"), legs[2].debt);
});

test("the chain's loan read is laid over the index only where it agrees with the last touch", () => {
  const last = { coll_after: "1200000000000000000", shares_after: "1510977534844989208.11579209364085243" };
  assert.ok(loanChainAgrees({ collRaw: "1200000000000000000", sharesRaw: "1510977534844989209" }, last, 4));
  assert.ok(!loanChainAgrees({ collRaw: "1300000000000000000", sharesRaw: "1510977534844989209" }, last, 4));
  assert.ok(!loanChainAgrees({ collRaw: "1200000000000000000", sharesRaw: "1500000000000000000" }, last, 4));
});
