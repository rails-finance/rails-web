// lib/liquity-v2/sp-*.ts — a Liquity V2 stability-pool deposit on the index's
// and the chain's raw integers (rails-ops
// reference/liquity-v2-stability-pool-deposits.md). The fixture rows are
// shaped as rails-server's /api/liquity-v2/stability-pool/timeline serves
// them (api/src/routes/liquityV2StabilityPool.ts, EVENT_COLS and ROW_COLS):
// a three-touch WETH deposit, built so each row's identity holds.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  barTotals,
  depositGap,
  depositLegs,
  depositLifetime,
  depositNow,
  depositNowFromChain,
  exactUnits,
  poolShare,
  priceUnits,
  sheetFigures,
  stashGap,
} from "../../lib/liquity-v2/sp-math.ts";
import { spHeadFigures } from "../../lib/liquity-v2/sp-chain-read.ts";
import { spEventLabel, spEventSentences } from "../../lib/liquity-v2/sp-event-prose.ts";
import { liquityV2DepositHref, normalizeDepositor, normalizeSpBranch } from "../../lib/liquity-v2/sp-routes.ts";

const E = (n) => (BigInt(Math.round(n * 1e6)) * BigInt(1e12)).toString();
const WALLET = "0x0630717c9c6baeabd2b0852e09df08febaccd227";

const row = (o) => ({
  collateral_type: "WETH",
  depositor: WALLET,
  tx_from: WALLET,
  tx_index: 1,
  log_index: 3,
  gas_used: "120000",
  effective_gas_price: "1000000000",
  deposit_loss: "0",
  top_up_or_withdrawal: "0",
  yield_gain_since: "0",
  yield_gain_claimed: "0",
  coll_gain_since: "0",
  coll_gain_claimed: "0",
  stash_before: "0",
  stash_after: "0",
  ...o,
});

// Opened with 1000; topped up 500 after a 10 burn, 2 yield kept, 0.005 WETH
// stashed; withdrew 200 after a 4 burn, claiming 1.5 yield and 0.007 WETH (the
// stash included).
const ROWS = [
  row({
    event_key: "sp_op:0xa_1",
    operation: 0,
    block_number: "22600000",
    block_timestamp: "1748000000",
    tx_hash: "0xa",
    top_up_or_withdrawal: E(1000),
    deposit_before: "0",
    deposit_after: E(1000),
  }),
  row({
    event_key: "sp_op:0xb_1",
    operation: 0,
    block_number: "22700000",
    block_timestamp: "1749200000",
    tx_hash: "0xb",
    deposit_loss: E(10),
    top_up_or_withdrawal: E(500),
    yield_gain_since: E(2),
    coll_gain_since: E(0.005),
    deposit_before: E(1000),
    deposit_after: E(1492),
    stash_after: E(0.005),
  }),
  row({
    event_key: "sp_op:0xc_1",
    operation: 1,
    block_number: "22800000",
    block_timestamp: "1750400000",
    tx_hash: "0xc",
    deposit_loss: E(4),
    top_up_or_withdrawal: `-${E(200)}`,
    yield_gain_since: E(1.5),
    yield_gain_claimed: E(1.5),
    coll_gain_since: E(0.002),
    coll_gain_claimed: E(0.007),
    deposit_before: E(1492),
    deposit_after: E(1288),
    stash_before: E(0.005),
    stash_after: "0",
  }),
];

const POSITION = {
  collateral_type: "WETH",
  depositor: WALLET,
  status: "open",
  deposit_raw: E(1288),
  stash_raw: "0",
  deposited_raw: E(1500),
  withdrawn_raw: E(200),
  burned_raw: E(14),
  yield_gain_raw: E(3.5),
  yield_claimed_raw: E(1.5),
  coll_gain_raw: E(0.007),
  coll_claimed_raw: E(0.007),
};

test("the deposit and stash identities hold over the life", () => {
  const l = depositLifetime(POSITION);
  assert.equal(depositGap(l), BigInt(0));
  assert.equal(stashGap(l), BigInt(0));
  assert.equal(exactUnits(l.kept), "2");
});

test("each row's legs replay deposit_after and stash_after", () => {
  let deposit = BigInt(0);
  let stash = BigInt(0);
  for (const r of ROWS) {
    const g = depositLegs(r);
    deposit = deposit - g.burned + g.deposited - g.withdrawn + g.yieldIn - g.yieldClaimed;
    stash = stash + g.collIn - g.collClaimed;
    assert.equal(deposit, g.deposit, r.event_key);
    assert.equal(stash, g.stash, r.event_key);
  }
});

const CHAIN = {
  compoundedRaw: E(1280),
  recordedRaw: E(1288),
  collGainRaw: E(0.003),
  stashRaw: "0",
  yieldGainRaw: E(0.75),
};

test("the chain's pending figures lay over the index only where the last touch agrees", () => {
  const l = depositLifetime(POSITION);
  const n = depositNow(l, CHAIN);
  assert.ok(n);
  assert.equal(exactUnits(n.pendingLoss), "8");
  assert.equal(exactUnits(n.collSinceTouch), "0.003");
  assert.equal(exactUnits(n.pendingYield), "0.75");
  // The chain has seen a touch the index has not: the two would not add up.
  assert.equal(depositNow(l, { ...CHAIN, recordedRaw: E(1300) }), null);
  // The card's headlines stand on the chain alone, the stash added in.
  assert.equal(exactUnits(depositNowFromChain({ ...CHAIN, stashRaw: E(0.001) }).pendingColl), "0.004");
});

const ok = (result) => ({ status: "success", result });
const fail = { status: "failure" };

test("the head read: a failed getter voids it, a failed fetchPrice falls back to lastGoodPrice", () => {
  const pool = [BigInt(E(1280)), BigInt(E(1288)), BigInt(E(0.003)), BigInt(0), BigInt(E(0.75))].map(ok);
  const live = spHeadFigures([...pool, ok([BigInt(E(3100)), false]), ok(BigInt(E(3050)))]);
  assert.equal(live.priceRaw, E(3100));
  assert.equal(live.priceStale, false);
  assert.equal(priceUnits(live.priceRaw), 3100);
  const fallback = spHeadFigures([...pool, fail, ok(BigInt(E(3050)))]);
  assert.equal(fallback.priceRaw, E(3050));
  assert.equal(fallback.priceStale, true);
  const unpriced = spHeadFigures([...pool, fail, fail]);
  assert.equal(unpriced.priceRaw, null);
  // The pool's total is apart: where it fails the page states no share.
  assert.equal(live.totalDepositsRaw, null);
  const totalled = spHeadFigures([...pool, fail, fail, ok(BigInt(E(64000)))]);
  assert.equal(totalled.totalDepositsRaw, E(64000));
  assert.equal(poolShare(BigInt(E(1280)), BigInt(E(64000))), 0.02);
  assert.equal(poolShare(BigInt(E(1280)), BigInt(0)), null);
  assert.equal(poolShare(BigInt(E(1280)), -BigInt(E(64000))), null);
  assert.equal(poolShare(BigInt(0), BigInt(E(64000))), 0);
  assert.equal(poolShare(BigInt(E(64000)), BigInt(E(64000))), 1);
  // Below 1e-12 the integer division reads 0; the card prints the floor.
  assert.equal(poolShare(BigInt(1), BigInt(E(64000))), 0);
  // The total failing alone leaves every other figure standing.
  const noTotal = spHeadFigures([...pool, ok([BigInt(E(3100)), false]), ok(BigInt(E(3050))), fail]);
  assert.equal(noTotal.totalDepositsRaw, null);
  assert.equal(noTotal.compoundedRaw, E(1280));
  assert.equal(noTotal.yieldGainRaw, E(0.75));
  assert.equal(noTotal.priceRaw, E(3100));
  assert.equal(spHeadFigures([pool[0], fail, ...pool.slice(2), fail, fail]), null);
});

test("each row's label says what the operation did", () => {
  assert.deepEqual(
    ROWS.map((r) => spEventLabel(r)),
    ["Opened", "Deposited", "Withdrew"],
  );
  const all = row({ operation: 1, top_up_or_withdrawal: `-${E(5)}`, deposit_before: E(5), deposit_after: "0" });
  assert.equal(spEventLabel(all), "Withdrew all");
  const claim = row({
    operation: 1,
    yield_gain_since: E(1),
    yield_gain_claimed: E(1),
    deposit_before: E(5),
    deposit_after: E(5),
  });
  assert.equal(spEventLabel(claim), "Claimed");
  const kept = row({ operation: 1, yield_gain_since: E(1), deposit_before: E(5), deposit_after: E(6) });
  assert.equal(spEventLabel(kept), "Compounded");
  const stash = row({
    operation: 2,
    coll_gain_claimed: E(0.1),
    stash_before: E(0.1),
    deposit_before: "0",
    deposit_after: "0",
  });
  assert.equal(spEventLabel(stash), "Claimed");
});

test("the sentences read V2's fields: the yield is BOLD, the claim includes the stash", () => {
  const s2 = spEventSentences(ROWS[1], "WETH");
  assert.ok(s2.includes("The depositor deposited 500 BOLD."));
  assert.ok(s2.includes("The branch's interest paid 2 BOLD of yield, kept in the deposit."));
  assert.ok(s2.includes("Liquidations paid 0.005 WETH in, stashed for a later claim."));
  const s3 = spEventSentences(ROWS[2], "WETH");
  assert.ok(s3.includes("The depositor withdrew 200 BOLD."));
  assert.ok(s3.some((l) => l.includes("burned 4 BOLD")));
  assert.ok(s3.includes("The branch's interest paid 1.5 BOLD of yield, all claimed."));
  assert.ok(s3.includes("Liquidations paid 0.002 WETH in."));
  assert.ok(
    s3.includes("The touch sent 0.007 WETH to the depositor, the 0.005 WETH stashed at earlier touches included."),
  );
  const other = spEventSentences({ ...ROWS[0], tx_from: "0x1111111111111111111111111111111111111111" }, "WETH");
  assert.ok(other.includes("0x1111…1111 sent the transaction."));
});

test("routes: a branch in any case, a depositor lowercased", () => {
  assert.equal(normalizeSpBranch("wsteth"), "wstETH");
  assert.equal(normalizeSpBranch("ETH"), null);
  assert.equal(normalizeDepositor(WALLET.toUpperCase().replace("0X", "0x")), WALLET);
  assert.equal(normalizeDepositor("0x12"), null);
  assert.equal(liquityV2DepositHref("rETH", WALLET), `/ethereum/liquity-v2/stability-pool/rETH/${WALLET}`);
});

test("a touch that moves BOLD, yield and collateral by nothing is Touched, and says so", () => {
  const nothing = row({ operation: 1, deposit_before: E(5), deposit_after: E(5) });
  assert.equal(spEventLabel(nothing), "Touched");
  assert.deepEqual(spEventSentences(nothing, "WETH"), ["The touch moved nothing."]);
  // Yield earned and kept is Compounded; earned and all claimed is Claimed.
  const kept = row({ operation: 1, yield_gain_since: E(1), deposit_before: E(5), deposit_after: E(6) });
  assert.equal(spEventLabel(kept), "Compounded");
  assert.deepEqual(spEventSentences(kept, "WETH"), [
    "The branch's interest paid 1 BOLD of yield, kept in the deposit.",
  ]);
  const partly = row({
    operation: 1,
    yield_gain_since: E(2),
    yield_gain_claimed: E(0.5),
    deposit_before: E(5),
    deposit_after: E(6.5),
  });
  assert.ok(
    spEventSentences(partly, "WETH").includes(
      "The branch's interest paid 2 BOLD of yield and 0.5 BOLD was claimed; the rest stays in the deposit.",
    ),
  );
  const stash = row({
    operation: 2,
    coll_gain_claimed: E(0.1),
    stash_before: E(0.1),
    deposit_before: "0",
    deposit_after: "0",
  });
  assert.ok(
    spEventSentences(stash, "WETH").includes("The depositor claimed the collateral stash and was sent 0.1 WETH."),
  );
});

test("the bars' totals from the legs alone equal the last row's deposit_after and stash_after", () => {
  const t = barTotals(ROWS.map(depositLegs));
  assert.equal(t.deposit.toString(), ROWS[2].deposit_after);
  assert.equal(t.stash.toString(), ROWS[2].stash_after);
  // Each row's sheet adds up: last − burned + yield = before; before + change − claimed = after.
  for (const r of ROWS) {
    const f = sheetFigures(r);
    assert.equal(f.before, f.last - f.burned + f.yieldPaid, r.event_key);
    assert.equal(f.after, f.before + f.change - f.yieldClaimed, r.event_key);
    assert.equal(f.stash, f.stashBefore - f.claimed, r.event_key);
  }
});
