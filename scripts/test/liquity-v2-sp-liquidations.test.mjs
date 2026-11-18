// lib/liquity-v2/sp-liquidations.ts — a deposit's closed stretches as market
// notes between its touches, read from rails-server's
// /api/liquity-v2/stability-pool/liquidations. The fixture is the rETH smoke
// deposit's one closed stretch, trimmed to two of its three liquidations, with
// a second stretch that held none.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { spBranchCheck, spLiquidationNotes, spNotesOnRows } from "../../lib/liquity-v2/sp-liquidations.ts";
import { anchorMarketNotes, spLiquidationsSentence } from "../../lib/shared/market-note.ts";

const POOL = "0xd442e41019b7f5c4dd78f50dc03726c446148695";
const liq = (block, ts, lost, coll, value, net) => ({
  block_number: String(block),
  block_timestamp: String(ts),
  tx_hash: `0x${String(block).padStart(64, "0")}`,
  tx_index: 1,
  log_index: 2,
  price: "2401823598033894537303",
  pool_bold_before: "1",
  pool_debt_offset: "1",
  pool_coll_sent: "1",
  deposit_before: "1",
  bold_lost: lost,
  coll_gained: coll,
  coll_gained_value: value,
  net,
});
const touch = (block, ts) => ({
  event_key: `sp_op:0x${block}_3`,
  block_number: String(block),
  block_timestamp: String(ts),
  tx_hash: `0x${block}`,
});

const read = {
  collateral_type: "rETH",
  depositor: "0x05dbd9ae94ca4745d62b02cff8dc5c94e71a7d93",
  served_thru_block: "26442160",
  units: {},
  totals: { bold_lost: "0", coll_gained: "0", coll_gained_value: "0", net: "0", liquidations: 2 },
  since_last_touch: null,
  branch_check: { deposits: "194", closed_stretches: "57", unreconciled: "0" },
  stretches: [
    {
      from: { ...touch(23006130, 1753566827), deposit: "98941075877365773571" },
      to: { ...touch(24947289, 1777003175), deposit_loss: "563316469787786003", coll_gain_since: "233764102363050" },
      liquidations: [
        liq(24355458, 1769869739, "313721870748847830", "112851179093595", "329407964286289950", "15686093537442120"),
        liq(24393003, 1770323147, "249594599038938173", "120912923269455", "262074328990884333", "12479729951946160"),
      ],
      totals: {
        bold_lost: "563316469787786003",
        coll_gained: "233764102363050",
        coll_gained_value: "591482293277174283",
        net: "28165823489388280",
      },
      residual: { bold_lost: "0", coll_gained: "0" },
      reconciles: true,
    },
    {
      from: { ...touch(24947289, 1777003175), deposit: "5" },
      to: { ...touch(25000000, 1778000000), deposit_loss: "1", coll_gain_since: "0" },
      liquidations: [],
      totals: { bold_lost: "0", coll_gained: "0", coll_gained_value: "0", net: "0" },
      residual: { bold_lost: "1", coll_gained: "0" },
      reconciles: false,
    },
  ],
};

test("one note per closed stretch that holds a liquidation or does not reconcile, its ends the two touches", () => {
  const notes = spLiquidationNotes("rETH", POOL, read);
  assert.equal(notes.length, 2);
  assert.equal(notes[1].stretch.liquidations.length, 0);
  assert.equal(notes[1].stretch.reconciles, false);
  assert.equal(notes[1].anchorTo, "sp_op:0x25000000_3");
  const n = notes[0];
  assert.equal(n.kind, "sp-liquidations");
  assert.equal(n.id, "sp-liquidations:rETH:23006130-24947289");
  assert.equal(n.from.eventId, "sp_op:0x23006130_3");
  assert.equal(n.to.eventId, "sp_op:0x24947289_3");
  assert.equal(n.to.block, 24947289);
  assert.equal(n.anchorTo, "sp_op:0x24947289_3");
  assert.deepEqual(n.branchCheck, { unreconciled: 0, closedStretches: 57 });
});

test("the note anchors on the touch that closed its stretch", () => {
  const notes = spLiquidationNotes("rETH", POOL, read);
  const events = [23006130, 24947289].map((b) => ({ id: `sp_op:0x${b}_3`, blockNumber: b, timestamp: 0, flows: [] }));
  const anchored = anchorMarketNotes(notes.slice(0, 1), events, "desc");
  assert.deepEqual([...anchored.keys()], ["sp_op:0x24947289_3"]);
});

test("two touches in one block: the note sits under its own closing touch", () => {
  const [n] = spLiquidationNotes("rETH", POOL, read);
  // A second touch earlier in the closing touch's block: the block rule would pick it.
  const events = [
    { id: "sp_op:0x23006130_3", blockNumber: 23006130, timestamp: 0, flows: [] },
    { id: "sp_op:0xother_1", blockNumber: 24947289, timestamp: 0, flows: [] },
    { id: "sp_op:0x24947289_3", blockNumber: 24947289, timestamp: 0, flows: [] },
  ];
  const anchored = anchorMarketNotes([n], events, "asc");
  assert.deepEqual([...anchored.keys()], ["sp_op:0x24947289_3"]);
});

test("a note shows only where both its touches are among the loaded rows", () => {
  const notes = spLiquidationNotes("rETH", POOL, read);
  const loaded = new Set(["sp_op:0x24947289_3", "sp_op:0x25000000_3"]);
  assert.deepEqual(
    spNotesOnRows(notes, (k) => loaded.has(k)).map((x) => x.id),
    ["sp-liquidations:rETH:24947289-25000000"],
  );
});

test("a reported loss with no liquidation has its own sentence", () => {
  const notes = spLiquidationNotes("rETH", POOL, read);
  assert.equal(
    spLiquidationsSentence(notes[1]),
    "Between blocks 24,947,289 and 25,000,000, the closing touch wrote 0.000000000000000001 BOLD burned and 0 rETH paid in, and no liquidation between the two touches accounts for it",
  );
});

test("the sentence states the sums and the block price", () => {
  const [n] = spLiquidationNotes("rETH", POOL, read);
  assert.equal(
    spLiquidationsSentence(n),
    "Between blocks 23,006,130 and 24,947,289, 2 liquidations burned 0.563 BOLD of this deposit and paid it 0.000234 rETH, worth 0.591 BOLD at each liquidation's block price: +0.028 BOLD net",
  );
});

test("a read without the branch check states none", () => {
  const { branch_check, ...rest } = read;
  assert.equal(branch_check.unreconciled, "0");
  assert.equal(spBranchCheck(rest), null);
});
