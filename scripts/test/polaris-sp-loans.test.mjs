// lib/polaris/sp-loan-math.ts — a Polaris stability-pool deposit and a
// reserve loan on the index's and the chain's raw integers (rails-ops
// TO-DO-stability-pool-deposits.md §2, TO-DO-polaris-scoping.md §8b).
// Fixtures: USDp deposit #40 and loan 63, read from the index on 17 Nov 2026
// and the chain at the same head.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  atFloor,
  compounded,
  debtAt,
  depositGap,
  depositLifetime,
  depositNow,
  exactUnits,
  feeAtTouch,
  loanLifetime,
  pendingFee,
  units,
} from "../../lib/polaris/sp-loan-math.ts";
import { depositHeadFigures, loanHeadFigures } from "../../lib/polaris/sp-loan-chain-read.ts";

const DEPOSIT_40 = {
  deposit_raw: "1375704987560019637555",
  snapshot_p: "998705853990692680623183527233301613",
  stashed_bc_raw: "0",
  deposited_raw: "1401000000000000000000",
  withdrawn_raw: "25020000000000000000",
  burned_raw: "275012439980362445",
  stable_gain_raw: "1657617857750591858",
  stable_claimed_raw: "1657617857750591858",
  bc_gain_raw: "45167193637326",
  bc_claimed_raw: "45167193637326",
};
const LAST_P = "834956443098278739762110399177963293";

test("the deposit identity holds over a life", () => {
  const l = depositLifetime(DEPOSIT_40);
  assert.equal(depositGap(l), BigInt(0));
  assert.equal(l.kept, BigInt(0));
});

test("the deposit now is the recorded deposit compounded at P, and the chain agrees", () => {
  const now = compounded(DEPOSIT_40.deposit_raw, DEPOSIT_40.snapshot_p, LAST_P);
  assert.equal(now.toString(), "1150142195097597313956");
  const l = depositLifetime(DEPOSIT_40);
  const n = depositNow(l, {
    compoundedRaw: "1150142195097597313956",
    recordedRaw: DEPOSIT_40.deposit_raw,
    stableGainRaw: "20645213179334719810",
    bcGainRaw: "32311722894610895",
    stashedRaw: "0",
  });
  assert.ok(n);
  assert.equal(n.pendingLoss, l.recorded - now);
  assert.equal(n.pendingPeth.toString(), "32311722894610895");
});

test("pending pETH adds the stash to the gain since the last touch", () => {
  const l = depositLifetime({ ...DEPOSIT_40, stashed_bc_raw: "580479345514963" });
  const n = depositNow(l, {
    compoundedRaw: DEPOSIT_40.deposit_raw,
    recordedRaw: DEPOSIT_40.deposit_raw,
    stableGainRaw: "0",
    bcGainRaw: "0",
    stashedRaw: "580479345514963",
  });
  assert.equal(n.pendingPeth.toString(), "580479345514963");
  assert.equal(n.pendingLoss, BigInt(0));
});

test("a chain read past a touch the index has not served is not laid over it", () => {
  const l = depositLifetime(DEPOSIT_40);
  assert.equal(
    depositNow(l, { compoundedRaw: "1", recordedRaw: "2", stableGainRaw: "0", bcGainRaw: "0", stashedRaw: "0" }),
    null,
  );
});

const LOAN_63 = [
  [
    "opened",
    "1000000000000000000",
    "1260301649662357011",
    "1001177499566133510544067735",
    "0",
    "1260301649662357011",
    "1260301649662357011",
  ],
  [
    "adjusted",
    "200000000000000000",
    "0",
    "1001177499566133510544067735",
    "1258819390376348410.508269561978931162",
    "1260301649662357011",
    "1260301649662357011",
  ],
  [
    "adjusted",
    "0",
    "277454050151666939",
    "1001261304567798869891661277",
    "1258819390376348410.508269561978931162",
    "1537755699814023950",
    "1537861195175130827",
  ],
  [
    "adjusted",
    "0",
    "-25000000000000000",
    "1002148909315902466474433846",
    "1535923927309823366.899194668834765929",
    "1512755699814023950",
    "1514224488545736950",
  ],
].map(([event_type, coll_change, debt_change, debt_per_share, shares_before, net_borrowed_to_here, debt_after]) => ({
  event_type,
  coll_change,
  debt_change,
  debt_per_share,
  shares_before,
  net_borrowed_to_here,
  debt_after,
}));

test("a loan's touches sum to borrowed, repaid and the fees charged at them", () => {
  const l = loanLifetime(LOAN_63);
  assert.equal(exactUnits(l.collDeposited), "1.2");
  assert.equal(l.borrowed.toString(), "1537755699814023950");
  assert.equal(l.repaid.toString(), "25000000000000000");
  assert.equal(l.borrowed - l.repaid + l.feesAtTouches, l.debtAtLastTouch);
  assert.equal(l.feesAtTouches.toString(), "1468788731713000");
});

test("each touch's fee is the index's growth on the shares before it", () => {
  assert.equal(feeAtTouch(LOAN_63[0], null), null);
  assert.equal(feeAtTouch(LOAN_63[1], LOAN_63[0]), BigInt(0));
  const third = feeAtTouch(LOAN_63[2], LOAN_63[1]);
  const fourth = feeAtTouch(LOAN_63[3], LOAN_63[2]);
  // The touches' fees add to the fees at the last touch, within a wei a touch.
  const sum = third + fourth;
  const diff = sum - loanLifetime(LOAN_63).feesAtTouches;
  assert.ok(diff >= BigInt(-3) && diff <= BigInt(3), `diff ${diff}`);
});

test("the debt at an index, the floor, and the fee since the last touch", () => {
  assert.equal(debtAt("1510977534844989209", "1003538845387309120785603758").toString(), "1516324650724503106");
  assert.equal(atFloor("1200000000000000000", "2018522686813542707").toString(), "2422227224176251248");
  const l = loanLifetime(LOAN_63);
  assert.equal(pendingFee("1516324653726002190", l).toString(), "2100165180265240");
  assert.equal(pendingFee("1", l), BigInt(0));
  assert.equal(units(BigInt("1500000000000000000")), 1.5);
});

const okr = (result) => ({ status: "success", result });
const fail = { status: "failure" };
const B = (v) => BigInt(v);

test("a deposit head read with any stated getter failed is stale, never zero", () => {
  const good = [
    okr(B("1150142195097597313956")),
    okr(B("1375704987560019637555")),
    okr([B(1), B("998705853990692680623183527233301613"), B(2), B(0)]),
    okr(B("20645213179334719810")),
    okr(B("32311722894610895")),
    okr(B(0)),
    okr("0x4CC14D2A595DCFF34B243A3B714B7A50630256B3"),
    okr(B("834956443098278739762110399177963293")),
    okr(B("5818000000000000000000")),
  ];
  const f = depositHeadFigures(good);
  assert.equal(f.bcGainRaw, "32311722894610895");
  assert.equal(f.owner, "0x4cc14d2a595dcff34b243a3b714b7a50630256b3");
  for (const i of [0, 1, 2, 3, 4, 5, 7]) {
    const r = [...good];
    r[i] = fail;
    assert.equal(depositHeadFigures(r), null, `getter ${i}`);
  }
  // ownerOf and the feed may fail: the holder falls back, the window drops its value.
  const r = [...good];
  r[6] = fail;
  r[8] = fail;
  const g = depositHeadFigures(r);
  assert.equal(g.owner, null);
  assert.equal(g.pethInStableRaw, null);
});

test("a loan head read with a failed debt or floor is stale, never zero", () => {
  const good = [
    okr([B("1200000000000000000"), B("1510977534844989209")]),
    okr(B("1516324653726002190")),
    okr(B("1003538847373770874626813476")),
    okr("0x4cc14d2a595dcff34b243a3b714b7a50630256b3"),
    okr(B("2018523485929292955")),
  ];
  assert.equal(loanHeadFigures(good).debtRaw, "1516324653726002190");
  for (const i of [0, 1, 2, 4]) {
    const r = [...good];
    r[i] = fail;
    assert.equal(loanHeadFigures(r), null, `getter ${i}`);
  }
  const closed = [...good];
  closed[3] = fail;
  assert.equal(loanHeadFigures(closed).owner, null);
});
