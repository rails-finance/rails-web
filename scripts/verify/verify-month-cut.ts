// verify-month-cut — a group never straddles a UTC month.
// ----------------------------------------------------------------------------
// rails-ops decision 0021, amendment 2026-09-29 (Miles): a run qualifies as a
// group on its full length against its kind's floor, then is cut at 00:00 UTC
// on the 1st of each month. A piece of two or more rows stays a group with its
// own header sums and date range; a single leftover row sits loose; a
// transaction's rows are never split. The same cases run against the index's
// pass in rails-server `api/src/services/timeline-folders.test.ts` (§11); this
// file runs them against the two web paths:
//
//   • lib/shared/timeline-grouping.ts — the port the web's routes group Morpho
//     Base, Compound V3 Base, Moonwell Base and Aave V3 Base with;
//   • lib/shared/timeline-chunks.ts `settleRunRows` — the client-grouped
//     families' run rows, including a month filter over them.
//
// OFFLINE. Pure functions, synthetic rows.
//
//   npx tsx --test scripts/verify/verify-month-cut.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupIntoRows, type GroupingAccess, type GroupingSpec } from "@/lib/shared/timeline-grouping";
import { settleRunRows, splitAtMonths, type RunGroupingSpec } from "@/lib/shared/timeline-chunks";
import { monthEndTs, monthIdxOf, monthStartTs } from "@/lib/shared/timeline-segments";

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

/** `before` rows in the last hours of August and `after` in the first hours
 *  of September, one transaction each, ascending. */
function acrossMonth(before: number, after: number, kind = "transfer_out"): Row[] {
  return [
    ...Array.from({ length: before }, (_, i) => mk(kind, SEP_1 - 3600 * (before - i))),
    ...Array.from({ length: after }, (_, i) => mk(kind, SEP_1 + 3600 * i)),
  ];
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
  min: 4,
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

const served = (rows: Row[]) => groupIntoRows(rows, [TRANSFER], ACCESS, { ordinalBase: 1 });
const folderCounts = (rows: Row[]) => served(rows).rows.flatMap((r) => (r.kind === "folder" ? [r.folder.count] : []));

// ── the web's route pass ────────────────────────────────────────────────────

test("route pass: six across the 1st is 4 + 2, each header summing its own month", () => {
  const wire = served(acrossMonth(4, 2)).rows;
  const folders = wire.flatMap((r) => (r.kind === "folder" ? [r.folder] : []));
  assert.deepEqual(
    folders.map((f) => [f.count, f.legs[0].amount]),
    [
      [4, "400"],
      [2, "200"],
    ],
  );
  for (const f of folders) assert.equal(monthIdxOf(f.firstAt), monthIdxOf(f.lastAt), `${f.responseId} straddles`);
});

test("route pass: 5 + 1 is a group and a loose row", () => {
  assert.deepEqual(
    served(acrossMonth(5, 1)).rows.map((r) => r.kind),
    ["folder", "event"],
  );
});

test("route pass: 3 + 3 under a floor of 4 is two groups, because the full run qualifies", () => {
  assert.deepEqual(folderCounts(acrossMonth(3, 3)), [3, 3]);
  assert.deepEqual(folderCounts(acrossMonth(3, 0)), [], "three alone stay rows");
});

test("route pass: a same-transaction pair on the boundary stays in one piece", () => {
  const rows = acrossMonth(3, 2);
  rows.splice(
    3,
    0,
    mk("transfer_out", SEP_1 - 1, { txHash: "0xpair" }),
    mk("transfer_out", SEP_1, { txHash: "0xpair" }),
  );
  const g = served(rows);
  assert.equal(g.folderByEvent.get(rows[3].id), g.folderByEvent.get(rows[4].id), "the pair shares a folder");
  assert.deepEqual(folderCounts(rows), [5, 2]);
});

test("route pass: a span read keeps the whole history's groups, ordinals and all", () => {
  const rows = acrossMonth(3, 3);
  const sep = monthIdxOf(SEP_1);
  const g = groupIntoRows(rows, [TRANSFER], ACCESS, {
    ordinalBase: 1,
    keep: (r) => r.timestamp >= monthStartTs(sep) && r.timestamp <= monthEndTs(sep),
  });
  const folders = g.rows.flatMap((r) => (r.kind === "folder" ? [r.folder] : []));
  // Three in September qualify because the run is six long.
  assert.deepEqual(
    folders.map((f) => [f.count, f.ordinalFirst, f.ordinalLast]),
    [[3, 4, 6]],
  );
  assert.equal(g.served.size, 3, "only the span's rows are served");
});

// ── the chunker's cut ───────────────────────────────────────────────────────

test("splitAtMonths: newest-first order cuts into the same pieces, newest piece first", () => {
  const rows = acrossMonth(4, 2);
  const asc = splitAtMonths(
    rows,
    (r) => r.timestamp,
    (r) => r.txHash,
  );
  const desc = splitAtMonths(
    [...rows].reverse(),
    (r) => r.timestamp,
    (r) => r.txHash,
  );
  assert.deepEqual(
    desc.map((p) => p.map((r) => r.id)),
    [...asc].reverse().map((p) => [...p].reverse().map((r) => r.id)),
  );
  assert.equal(monthIdxOf(desc[0][0].timestamp), monthIdxOf(SEP_1), "September leads");
});

// ── the client-grouped families ─────────────────────────────────────────────

const RUN: RunGroupingSpec<Row> = { match: (r) => r.kind === "liquidation", min: 4 };
const desc = (rows: Row[]) => [...rows].reverse();
const all = () => true;
const runSizes = (out: ReturnType<typeof settleRunRows<Row, RunGroupingSpec<Row>>>) =>
  out.map((r) => (r.kind === "run" ? r.events.length : "·"));

test("client runs: 4 + 2, 5 + 1 and 3 + 3 read as on the index, newest first", () => {
  assert.deepEqual(runSizes(settleRunRows(desc(acrossMonth(4, 2, "liquidation")), [RUN], all)), [2, 4]);
  assert.deepEqual(runSizes(settleRunRows(desc(acrossMonth(5, 1, "liquidation")), [RUN], all)), ["·", 5]);
  assert.deepEqual(runSizes(settleRunRows(desc(acrossMonth(3, 3, "liquidation")), [RUN], all)), [3, 3]);
});

test("client runs: a month filter shows the unfiltered groups whole", () => {
  const rows = desc(acrossMonth(3, 3, "liquidation"));
  const aug = monthIdxOf(SEP_1 - 1);
  const inAug = (r: Row) => r.timestamp >= monthStartTs(aug) && r.timestamp <= monthEndTs(aug);
  const out = settleRunRows(rows, [RUN], inAug);
  // Three in August qualify because the run is six long; filtering first would
  // have left three under the floor.
  assert.deepEqual(runSizes(out), [3]);
  assert.equal(out[0].flatIdx, 0, "flatIdx counts the in-range events");
});

test("client runs: a custom range cuts a piece member by member, keeping two or more as a group", () => {
  const rows = desc(acrossMonth(6, 0, "liquidation"));
  const lastTwo = (r: Row) => r.timestamp >= SEP_1 - 2 * 3600;
  assert.deepEqual(runSizes(settleRunRows(rows, [RUN], lastTwo)), [2]);
  const lastOne = (r: Row) => r.timestamp >= SEP_1 - 3600;
  assert.deepEqual(runSizes(settleRunRows(rows, [RUN], lastOne)), ["·"]);
});

test("client runs: a one-event row of several logs is not cut", () => {
  const tx = "0xone";
  const rows = [mk("leg", SEP_1 - 1, { txHash: tx }), mk("leg", SEP_1, { txHash: tx })];
  const spec: RunGroupingSpec<Row> = {
    asOneEvent: true,
    match: (r) => r.kind === "leg",
    min: 2,
    sameRun: (a, b) => a.txHash === b.txHash,
  };
  assert.deepEqual(runSizes(settleRunRows(desc(rows), [spec], all)), [2]);
});

test("client runs: flatIdx numbers loose rows and runs contiguously", () => {
  const rows = desc([mk("supply", SEP_1 - 90_000), ...acrossMonth(5, 1, "liquidation"), mk("supply", SEP_1 + 90_000)]);
  const out = settleRunRows(rows, [RUN], all);
  assert.deepEqual(
    out.map((r) => [r.kind, r.flatIdx]),
    [
      ["event", 0],
      ["event", 1],
      ["run", 2],
      ["event", 7],
    ],
  );
});
