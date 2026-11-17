// The Liquity forks' transform on a transferTrove row (rails-server's
// ?transfers=1): the wallets as `transfer`, no balance envelope, no flows, no
// operation, the label "Transfer", the sender as the row's wallet. A row
// without the transfer columns comes out as before. The three forks share the
// transform's shape, so each runs the same rows.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { buildEbisuTimeline } = await import("../../lib/sources/api/ebisu-timeline.ts");
const { buildAsymmetryTimeline } = await import("../../lib/sources/api/asymmetry-timeline.ts");
const { buildBasedollarTimeline } = await import("../../lib/sources/api/basedollar-timeline.ts");

const FROM = "0x8d78a47274818e1c81e47cfece5bef5fecc4b5ec";
const TO = "0x25b85831da750c912ab7f0cf53b9d82f7894ed07";
const TX = "0x4b33a00183bae8479c95ea529265d8ebf3a152d874257df2a5c43e62e2a0f8a3";

const base = {
  block_timestamp: "1773173231",
  block_number: "24629345",
  tx_index: 70,
  log_index: 1,
  trove_id: "38767992399838988350336392758823407708425408086117331868518504752269504506657",
  is_batched: false,
  was_batched: false,
  batch_manager: null,
  coll_after: "3890000000000000000000",
  debt_after: "2018760050204621524078",
  coll_before: "3890000000000000000000",
  debt_before: "2018760050204621524078",
  stake: "3890000000000000000000",
  annual_interest_rate: "51000000000000000",
  tx_gas_used: null,
  tx_gas_price: null,
  debt_change_from_operation: null,
  debt_increase_from_upfront_fee: null,
  debt_increase_from_redist: null,
  coll_change_from_operation: null,
  coll_increase_from_redist: null,
  redemption_actual: null,
};

/** The transfer row as the route serves it, and an adjustment without the
 *  transfer columns, one block earlier. */
const rows = (collateral) => [
  {
    ...base,
    block_number: "24629000",
    log_index: 4,
    tx_hash: "0x" + "ab".repeat(32),
    tx_from: FROM,
    collateral,
    action: "adjustTrove",
    coll_before: "3800000000000000000000",
    coll_change_from_operation: "90000000000000000000",
    debt_change_from_operation: "0",
    debt_increase_from_upfront_fee: "0",
    tx_gas_used: "250000",
    tx_gas_price: "1000000000",
  },
  { ...base, tx_hash: TX, tx_from: null, collateral, action: "transferTrove", transfer_from: FROM, transfer_to: TO },
];

const FORKS = [
  ["ebisu", buildEbisuTimeline, "susde"],
  ["asymmetry", buildAsymmetryTimeline, "ysybold"],
  ["basedollar", buildBasedollarTimeline, "weth"],
];

for (const [fork, build, branch] of FORKS) {
  test(`${fork}: a transferTrove row carries its wallets and moves nothing`, () => {
    const { events } = build(rows(branch), branch, base.trove_id);
    const e = events[1];
    const ctx = e.context.data;
    assert.equal(e.actionType, "transferTrove");
    assert.equal(e.actionLabel, "Transfer");
    assert.equal(e.wallet, FROM);
    assert.equal(e.id, `${TX}-1`);
    assert.deepEqual(e.flows, []);
    assert.equal(e.gas, undefined);
    assert.deepEqual(ctx.transfer, { transferType: "transfer", fromAddress: FROM, toAddress: TO });
    assert.equal(ctx.origin, undefined);
    assert.equal(ctx.originBefore, undefined);
    assert.equal(ctx.operation, undefined);
    assert.equal(ctx.collAfter, ctx.collBefore);
    assert.equal(ctx.debtAfter, ctx.debtBefore);
  });

  test(`${fork}: a row without the transfer columns comes out as before`, () => {
    const { events } = build(rows(branch), branch, base.trove_id);
    const e = events[0];
    const ctx = e.context.data;
    assert.equal(e.actionType, "adjustTrove");
    assert.equal(e.wallet, FROM);
    assert.equal(ctx.transfer, undefined);
    assert.ok(ctx.origin && ctx.origin.coll, "the adjustment keeps its envelope");
    assert.ok(ctx.operation, "the adjustment keeps its operation");
    assert.equal(e.flows.length, 1);
  });
}
