// verify-group-rule — five transactions of one act make one group.
// ----------------------------------------------------------------------------
// rails-ops decision 0039: five or more consecutive transactions of the same
// act, unbroken by any other row, are one group whatever its length; a
// repeating set (the shape run) counts the same way. No month cut, no size
// cut. This file runs the rule against the two web paths:
//
//   • lib/shared/timeline-grouping.ts `groupIntoRows` — the route pass for
//     Morpho Base, Compound V3 Base, Moonwell Base and Aave V3 Base;
//   • lib/shared/timeline-chunks.ts `settleRunRows` — the client-grouped
//     families' run rows.
//
// OFFLINE. Pure functions, synthetic rows.
//
//   npx tsx --test scripts/verify/verify-group-rule.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupIntoRows, type GroupingAccess, type GroupingSpec } from "@/lib/shared/timeline-grouping";
import { GROUP_MIN_TRANSACTIONS, settleRunRows, type RunGroupingSpec } from "@/lib/shared/timeline-chunks";

const SEP_1 = Date.UTC(2026, 8, 1) / 1000;

interface Row {
  id: string;
  txHash: string;
  block: number;
  timestamp: number;
  kind: string;
  amount: string;
}

let seq = 0;
function mk(kind: string, timestamp: number, over: Partial<Row> = {}): Row {
  const n = seq++;
  return { id: `e${n}`, txHash: `0xtx${n}`, block: 1000 + n, timestamp, kind, amount: "100", ...over };
}

/** `n` rows of `kind`, one transaction each, an hour apart, ascending. */
function streak(n: number, kind = "transfer_out", from = SEP_1 - 3600 * n): Row[] {
  return Array.from({ length: n }, (_, i) => mk(kind, from + 3600 * i));
}

/** `before` rows in the last hours of August and `after` in the first hours
 *  of September, one transaction each, ascending. */
function acrossMonth(before: number, after: number, kind = "transfer_out"): Row[] {
  return [...streak(before, kind), ...streak(after, kind, SEP_1)];
}

/** `txs` transactions of `rowsPerTx` rows each, ascending. */
function inTransactions(txs: number, rowsPerTx: number, kind = "transfer_out"): Row[] {
  const out: Row[] = [];
  for (let t = 0; t < txs; t++) {
    const hash = `0xmulti${seq++}`;
    for (let r = 0; r < rowsPerTx; r++) out.push(mk(kind, SEP_1 + 3600 * t, { txHash: hash }));
  }
  return out;
}

const ACCESS: GroupingAccess<Row> = {
  eventKey: (r) => r.id,
  txHash: (r) => r.txHash,
  blockNumber: (r) => r.block,
  timestamp: (r) => r.timestamp,
};

const TRANSFER: GroupingSpec<Row> = {
  kind: "transfer",
  match: (r) => r.kind === "transfer_out",
  kindOf: (r) => r.kind,
  legsOf: (r) => [
    {
      verb: "Sent",
      asset: "0xaaa",
      assetKeyKind: "tokenAddress",
      amount: r.amount,
      provWhat: "Sent",
      symbol: "AAA",
      decimals: 0,
    },
  ],
};

/** A repeating set: a supply and a borrow in each transaction. */
const SHAPE: GroupingSpec<Row> = {
  kind: "owner_run",
  match: () => false,
  kindOf: (r) => r.kind,
  shape: {
    keyOf: (r) => (r.kind === "supply" || r.kind === "borrow" ? r.kind : null),
    anchor: () => true,
    netLegOf: (r) => [
      {
        axis: r.kind,
        asset: "0xaaa",
        assetKeyKind: "tokenAddress",
        amount: BigInt(r.amount),
        up: r.kind === "supply" ? "Supplied" : "Borrowed",
        down: "Withdrawn",
        symbol: "AAA",
        decimals: 0,
      },
    ],
  },
};

function shapeTxs(n: number): Row[] {
  const out: Row[] = [];
  for (let t = 0; t < n; t++) {
    const hash = `0xshape${seq++}`;
    out.push(mk("supply", SEP_1 + 3600 * t, { txHash: hash }), mk("borrow", SEP_1 + 3600 * t, { txHash: hash }));
  }
  return out;
}

const served = (rows: Row[], specs: GroupingSpec<Row>[] = [TRANSFER]) =>
  groupIntoRows(rows, specs, ACCESS, { ordinalBase: 1 });
const shapeOf = (rows: Row[], specs?: GroupingSpec<Row>[]) =>
  served(rows, specs).rows.map((r) => (r.kind === "folder" ? r.folder.count : "·"));

const RUN: RunGroupingSpec<Row> = { match: (r) => r.kind === "transfer_out" };
const all = () => true;
const settled = (rows: Row[], inRange: (r: Row) => boolean = all) =>
  settleRunRows(rows, [RUN], inRange).map((r) => (r.kind === "run" ? r.events.length : "·"));
const desc = (rows: Row[]) => [...rows].reverse();

test("the floor is five transactions", () => {
  assert.equal(GROUP_MIN_TRANSACTIONS, 5);
});

test("4 transactions stay rows; 5 group", () => {
  assert.deepEqual(shapeOf(streak(4)), ["·", "·", "·", "·"]);
  assert.deepEqual(shapeOf(streak(5)), [5]);
  assert.deepEqual(settled(streak(4)), ["·", "·", "·", "·"]);
  assert.deepEqual(settled(streak(5)), [5]);
});

test("5 rows in 2 transactions stay rows; 10 rows in 5 transactions group", () => {
  const two = [...inTransactions(1, 3), ...inTransactions(1, 2)];
  assert.deepEqual(shapeOf(two), ["·", "·", "·", "·", "·"]);
  assert.deepEqual(settled(two), ["·", "·", "·", "·", "·"]);
  assert.deepEqual(shapeOf(inTransactions(5, 2)), [10]);
  assert.deepEqual(settled(inTransactions(5, 2)), [10]);
});

test("a redemption counts per call: three hits per transaction group at five calls", () => {
  // The Liquity V2 case: ten redemptions in four transactions, three, three,
  // three and one (decision 0039, amended 2026-10-15).
  const redeem = (r: Row) => r.kind === "redeem";
  const perCall: RunGroupingSpec<Row> = { match: redeem, actKeyOf: (r) => r.id };
  const rows = [...inTransactions(3, 3, "redeem"), ...inTransactions(1, 1, "redeem")];
  const settledBy = (spec: RunGroupingSpec<Row>, rs: Row[]) =>
    settleRunRows(rs, [spec], all).map((r) => (r.kind === "run" ? r.events.length : "·"));
  assert.deepEqual(settledBy(perCall, rows), [10]);
  assert.deepEqual(settledBy(perCall, desc(rows)), [10]);
  assert.deepEqual(settledBy(perCall, inTransactions(4, 1, "redeem")), ["·", "·", "·", "·"], "four calls stay rows");
  // The route pass takes the same key.
  const REDEEM: GroupingSpec<Row> = { kind: "redemption", match: redeem, kindOf: (r) => r.kind, actKeyOf: (r) => r.id };
  assert.deepEqual(shapeOf(rows, [REDEEM]), [10]);
  // Any other kind counts per transaction: a liquidation whose three legs
  // share one transaction is one act, so four such transactions stay rows.
  const legs = inTransactions(4, 3, "liquidate");
  assert.deepEqual(settledBy({ match: (r) => r.kind === "liquidate" }, legs), Array(12).fill("·"));
  assert.deepEqual(settledBy({ match: (r) => r.kind === "liquidate" }, inTransactions(5, 3, "liquidate")), [15]);
});

test("a run across a month edge is one group", () => {
  const rows = acrossMonth(3, 3);
  assert.deepEqual(shapeOf(rows), [6]);
  assert.deepEqual(settled(rows), [6]);
  const folder = served(rows).rows[0];
  assert.ok(folder.kind === "folder" && folder.folder.legs[0].amount === "600", "the header sums all six");
});

test("250 is one group", () => {
  assert.deepEqual(shapeOf(streak(250)), [250]);
  assert.deepEqual(settled(streak(250)), [250]);
});

test("an unrelated row in the middle makes two runs, each judged on its own", () => {
  const sixAndFour = [...streak(6), mk("supply", SEP_1 + 1), ...streak(4, "transfer_out", SEP_1 + 2)];
  assert.deepEqual(shapeOf(sixAndFour), [6, "·", "·", "·", "·", "·"]);
  assert.deepEqual(settled(sixAndFour), [6, "·", "·", "·", "·", "·"]);
  const fiveAndFive = [...streak(5), mk("supply", SEP_1 + 1), ...streak(5, "transfer_out", SEP_1 + 2)];
  assert.deepEqual(shapeOf(fiveAndFive), [5, "·", 5]);
  assert.deepEqual(settled(fiveAndFive), [5, "·", 5]);
});

test("a shape run of 5 transactions groups and 4 do not", () => {
  const five = served(shapeTxs(5), [SHAPE]).rows;
  assert.deepEqual(
    five.map((r) => (r.kind === "folder" ? [r.folder.count, r.folder.txCount] : "·")),
    [[10, 5]],
  );
  assert.ok(shapeOf(shapeTxs(4), [SHAPE]).every((r) => r === "·"));
});

test("newest-first order gives the same groups", () => {
  const rows = [...streak(7), mk("supply", SEP_1 + 1), ...streak(3, "transfer_out", SEP_1 + 2), ...acrossMonth(2, 3)];
  assert.deepEqual(settled(desc(rows)), [...settled(rows)].reverse());
});

test("a range that cuts a group keeps its in-range members, qualified on the whole run", () => {
  const rows = acrossMonth(3, 3);
  const inSep = (r: Row) => r.timestamp >= SEP_1;
  assert.deepEqual(settled(desc(rows), inSep), [3]);
  const g = groupIntoRows(rows, [TRANSFER], ACCESS, { ordinalBase: 1, keep: inSep });
  assert.deepEqual(
    g.rows.map((r) => (r.kind === "folder" ? [r.folder.count, r.folder.ordinalFirst, r.folder.ordinalLast] : "·")),
    [[3, 4, 6]],
  );
});

test("a one-event row of several logs keeps its own floor", () => {
  const tx = "0xone";
  const rows = [mk("leg", SEP_1 - 1, { txHash: tx }), mk("leg", SEP_1, { txHash: tx })];
  const spec: RunGroupingSpec<Row> = {
    asOneEvent: true,
    match: (r) => r.kind === "leg",
    min: 2,
    sameRun: (a, b) => a.txHash === b.txHash,
  };
  const out = settleRunRows(desc(rows), [spec], all);
  assert.deepEqual(
    out.map((r) => (r.kind === "run" ? r.events.length : "·")),
    [2],
  );
});

test("flatIdx numbers loose rows and runs contiguously", () => {
  const rows = desc([mk("supply", SEP_1 - 90_000), ...streak(6), mk("supply", SEP_1 + 90_000)]);
  const out = settleRunRows(rows, [RUN], all);
  assert.deepEqual(
    out.map((r) => [r.kind, r.flatIdx]),
    [
      ["event", 0],
      ["run", 1],
      ["event", 7],
    ],
  );
});
