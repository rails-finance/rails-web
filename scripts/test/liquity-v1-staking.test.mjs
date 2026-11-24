// lib/liquity-v1/staking-*.ts — a Liquity V1 LQTY stake on the index's and the
// chain's raw integers. The fixture is a whole stake as rails-server's
// /api/liquity-v1/staking/timeline serves it (mig 502, read on 21 Nov 2026):
// four touches by 0x0f43…da5a, an open, a stake with fees paid, a claim and an
// unstake down to 0.01 LQTY.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  exactUnits,
  stakeGap,
  stakeLegs,
  stakeLifetime,
  stakeNow,
  stakeNowFromChain,
  stakeShare,
  units,
} from "../../lib/liquity-v1/staking-math.ts";
import { stakeHeadFigures } from "../../lib/liquity-v1/staking-chain-read.ts";
import { stEventLabel, stEventSentences } from "../../lib/liquity-v1/staking-event-prose.ts";
import { liquityV1StakeHref, normalizeStaker } from "../../lib/liquity-v1/staking-routes.ts";

const ROWS = [
  {
    operation: "stake",
    block_number: "16725703",
    stake_change: "203938063121465830844",
    lusd_gain: "0",
    eth_gain: "0",
    stake_before: "0",
    stake_after: "203938063121465830844",
  },
  {
    operation: "stake",
    block_number: "16810364",
    stake_change: "229451592210000000000",
    lusd_gain: "1557496270658443458",
    eth_gain: "367444076765953",
    stake_before: "203938063121465830844",
    stake_after: "433389655331465830844",
  },
  {
    operation: "claim",
    block_number: "16841378",
    stake_change: "0",
    lusd_gain: "1026732750520236360",
    eth_gain: "9429237494",
    stake_before: "433389655331465830844",
    stake_after: "433389655331465830844",
  },
  {
    operation: "unstake",
    block_number: "16841426",
    stake_change: "-433379655331465830844",
    lusd_gain: "0",
    eth_gain: "0",
    stake_before: "433389655331465830844",
    stake_after: "10000000000000000",
  },
];
const POSITION = {
  status: "open",
  stake_raw: "10000000000000000",
  staked_raw: "433389655331465830844",
  unstaked_raw: "433379655331465830844",
  lusd_gain_raw: "2584229021178679818",
  eth_gain_raw: "367453506003447",
};

test("the stake identity: staked − unstaked is the stake, and the legs add up to it", () => {
  const l = stakeLifetime(POSITION);
  assert.equal(stakeGap(l), BigInt(0));
  let stake = BigInt(0);
  for (const r of ROWS) {
    const g = stakeLegs(r);
    stake += g.staked - g.unstaked;
    assert.equal(stake, g.stake, r.block_number);
  }
  assert.equal(stake, l.stake);
});

test("each touch's label and words", () => {
  assert.deepEqual(
    ROWS.map((r) => stEventLabel(r)),
    ["Opened", "Staked", "Claimed", "Unstaked"],
  );
  assert.deepEqual(stEventSentences(ROWS[0]), [
    "The staker staked 203.938063121465830844 LQTY.",
    "No fees were pending, so the touch paid none.",
  ]);
  assert.deepEqual(stEventSentences(ROWS[2]), [
    "The staker called unstake with 0, which claims the fees and moves no LQTY.",
    "The touch paid the staker 1.02673275052023636 LUSD of borrowing fees.",
    "The touch paid the staker 0.000000009429237494 ETH of redemption fees.",
  ]);
  assert.equal(stEventLabel({ ...ROWS[3], stake_after: "0" }), "Unstaked all");
});

test("the head read: a failed staker getter is no read; the pool total and price stand apart", () => {
  const ok = (v) => ({ status: "success", result: BigInt(v) });
  const fail = { status: "failure" };
  const res = [
    ok("10000000000000000"),
    ok("487083865924091"),
    ok("249053874307"),
    ok("52998747025039327578894455"),
    fail,
    ok("1635280000000000000000"),
  ];
  const f = stakeHeadFigures(res);
  assert.equal(f.stakeRaw, "10000000000000000");
  assert.equal(f.priceRaw, "1635280000000000000000");
  assert.equal(f.priceStale, true);
  assert.equal(stakeHeadFigures([fail, ...res.slice(1)]), null);
  const now = stakeNowFromChain(f);
  assert.equal(units(now.pendingLusd), 0.000487083865924091);
  // The chain agrees with the index's stake: the pending figures lay over it.
  assert.ok(stakeNow(stakeLifetime(POSITION), f));
  assert.equal(stakeNow(stakeLifetime(POSITION), { ...f, stakeRaw: "1" }), null);
  assert.equal(stakeShare(now.stake, BigInt(f.totalStakedRaw)), 1.88e-10);
});

test("units and routes", () => {
  assert.equal(exactUnits(BigInt("-433379655331465830844")), "-433.379655331465830844");
  assert.equal(
    normalizeStaker(" 0x0F43150E96BD5FF48909C6B3B5A029AEBA8EDA5A "),
    "0x0f43150e96bd5ff48909c6b3b5a029aeba8eda5a",
  );
  assert.equal(normalizeStaker("nope"), null);
  assert.equal(liquityV1StakeHref("0xABC"), "/ethereum/liquity-v1/staking/0xabc");
});
