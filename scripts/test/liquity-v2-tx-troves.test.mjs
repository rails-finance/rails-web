// lib/liquity-v2/tx-troves-words.ts — the "In this transaction" line of a
// Liquity V2 deposit card (rails-ops ui-jobs 751). The fixture is the five
// TroveOperation rows rails-server's GET /api/liquity-v2/tx/:hash/troves serves
// for tx 0x1948935c…fb33a (block 26441966), given out of log order.
// Run: npm test
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  groupTxTroves,
  joinWords,
  troveOpVerb,
  TROVE_OP_VERBS,
  TX_HASH,
  txTrovesLine,
  txTrovesText,
} from "../../lib/liquity-v2/tx-troves-words.ts";

const WSTETH_TM = "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22";
const row = (collateral_type, trove_id, operation, operation_enum, log_index, contract_address = WSTETH_TM) => ({
  collateral_type,
  trove_id,
  operation,
  operation_enum,
  log_index,
  block_number: "26441966",
  block_timestamp: "1795005167",
  contract_address,
  transaction_from: "0x0000000000c5da59ee1b2d2ef258a3290a916012",
});
const A = "71094620452174216861171338743394838360182656193544866255678560160403958287687";
const B = "66751419081380212228883368225538395559492017224458172842785022177378489064739";
const C = "6639309809310393990827184122515282228685905922213190453576858458910205834531";
const D = "53845265062526622754767503451635837318709940751283040427736030609983021944385";
const ROWS = [
  row("WETH", B, "redeemCollateral", 6, 687, "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a"),
  row("wstETH", A, "closeTrove", 1, 674),
  row("wstETH", C, "redeemCollateral", 6, 693),
  row("wstETH", A, "openTrove", 0, 22),
  row("rETH", D, "redeemCollateral", 6, 700, "0xb2b2abeb5c357a234363ff5d180912d319e3e19e"),
];
const name = (t) => `Trove ${t.troveId.slice(0, 4)}…${t.troveId.slice(-4)} (${t.collateralType})`;

test('verbs: each operation in the app\'s words; an unknown one reads "acted on"', () => {
  assert.equal(troveOpVerb("openTrove"), "opened");
  assert.equal(troveOpVerb("adjustTroveInterestRate"), "interest rate changed");
  assert.equal(troveOpVerb("redeemCollateral"), "redeemed");
  assert.equal(troveOpVerb("applyPendingDebt"), "had pending debt applied");
  assert.equal(troveOpVerb("openTroveAndJoinBatch"), "opened");
  assert.equal(troveOpVerb("setInterestBatchManager"), "joined a delegate");
  assert.equal(troveOpVerb("removeFromBatch"), "left a delegate");
  assert.equal(troveOpVerb("somethingNew"), "acted on");
  assert.equal(joinWords(["a"]), "a");
  assert.equal(joinWords(["a", "b", "c"]), "a, b and c");
});

test("every TroveOperationType member has a verb", () => {
  const src = readFileSync(new URL("../../types/api/troveHistory.ts", import.meta.url), "utf8");
  const block = src.match(/export type TroveOperationType =([^;]+);/)[1];
  const members = [...block.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
  assert.equal(members.length, 10);
  for (const m of members) assert.ok(m in TROVE_OP_VERBS, m);
});

test("rows group per Trove in first-log order, operations in log order", () => {
  const g = groupTxTroves(ROWS);
  assert.deepEqual(
    g.map((t) => [t.collateralType, t.troveId, t.verbs]),
    [
      ["wstETH", A, "opened and closed"],
      ["WETH", B, "redeemed"],
      ["wstETH", C, "redeemed"],
      ["rETH", D, "redeemed"],
    ],
  );
  assert.deepEqual(
    g[0].ops.map((o) => o.log_index),
    [22, 674],
  );
});

test("the 0x1948…b33a line", () => {
  const line = txTrovesLine({ rows: ROWS, truncated: false });
  assert.equal(
    txTrovesText(line, name),
    "In this transaction: Trove 7109…7687 (wstETH) opened and closed; Trove 6675…4739 (WETH), Trove 6639…4531 (wstETH) and Trove 5384…4385 (rETH) redeemed.",
  );
});

test("a repeated operation is counted", () => {
  const line = txTrovesLine({
    rows: [row("WETH", "7", "adjustTrove", 2, 3), row("WETH", "7", "adjustTrove", 2, 4)],
    truncated: false,
  });
  assert.equal(
    txTrovesText(line, (t) => `Trove ${t.troveId}`),
    "In this transaction: Trove 7 adjusted twice.",
  );
});

test("cap at five Troves, then the count; a cut answer says more Troves when full, more operations when not", () => {
  const rows = Array.from({ length: 8 }, (_, i) => row("WETH", String(i + 1), "liquidate", 5, i));
  const line = txTrovesLine({ rows, truncated: false });
  assert.equal(line.more, 3);
  assert.equal(
    txTrovesText(line, (t) => `Trove ${t.troveId}`),
    "In this transaction: Trove 1, Trove 2, Trove 3, Trove 4 and Trove 5 liquidated; and 3 more Troves.",
  );
  const cut = txTrovesLine({ rows, truncated: true });
  assert.match(
    txTrovesText(cut, (t) => t.troveId),
    /; and more Troves\.$/,
  );
  // Cut, with every Trove named: the cut left out operations.
  const few = txTrovesLine({ rows: rows.slice(0, 3), truncated: true });
  assert.match(
    txTrovesText(few, (t) => t.troveId),
    /liquidated; and more operations\.$/,
  );
  const five = txTrovesLine({ rows: rows.slice(0, 5), truncated: true });
  assert.match(
    txTrovesText(five, (t) => t.troveId),
    /; and more Troves\.$/,
  );
  const six = txTrovesLine({ rows: rows.slice(0, 6), truncated: false });
  assert.match(
    txTrovesText(six, (t) => t.troveId),
    /; and 1 more Trove\.$/,
  );
});

test("no rows, no line; the hash check", () => {
  assert.equal(txTrovesLine({ rows: [], truncated: false }), null);
  assert.ok(TX_HASH.test("0x1948935cba9c243bd7fa1112bc7b5110a6020cb70f156844c3111c22ad4fb33a"));
  assert.ok(!TX_HASH.test("0x1948"));
});
