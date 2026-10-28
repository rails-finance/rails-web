// verify-fluid-threshold-history — a Fluid T1 position chart's liquidation
// threshold across the life (lib/fluid/threshold-history.ts; rails-ops
// reference/lifetime-price-chart.md, the Fluid rows; ui-jobs 328 step 8).
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 28 Oct 2026 from rails-server's
// /api/fluid/threshold-history on victoria
// (scripts/verify/fixtures/fluid-threshold-history.json, each row's `args`
// dropped), with each position's first event from mv_fluid_positions:
//
//   #2156  cbBTC / USDC (0x01c7…125e), open since 27 Sep 2024: the threshold
//          85 % at its first event, 88 % from 11 Oct 2024, 90 % from 21 May 2025
//   #1334  WBTC / USDT (0x3a0b…4c40), 20 Jul to 25 Sep 2024, closed: 85 %,
//          88 % from 18 Aug 2024; the 21 May 2025 change after its close
//   #6     ETH / USDT (0xbec4…0991), open: the vault's first configuration
//          alone, 90 % across the life
//   #8538  weETH / USDT (0x9264…a5f1), open, liquidated in part: 80 % → 82 %
//          on 7 Aug 2024, before its life, so 82 % across it
//
// Held: the first read is the threshold in force at the first event (the
// last row at or below its block), then one read per change after it, on
// its day; no reads where the history does not reach the first event, is
// not covered or failed (the view then holds today's); one marker per
// change, its before → after in percent and its block, in a receipt; the
// health view's line and the collateral's level step on the change's day,
// and a closed life draws no day past its close; the how-to-read says the
// line steps where governance changed it.
//
//   npx tsx --test scripts/verify/verify-fluid-threshold-history.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fluidThresholdChanges, fluidThresholdReads, type FluidThresholdHistory } from "@/lib/fluid/threshold-history";
import { FLUID_HEALTH_SOURCE, FLUID_HISTORY_HEALTH_SOURCE } from "@/lib/fluid/flows-health";
import { healthView } from "@/lib/shared/flows-health";
import { changesByDay } from "@/lib/shared/flows-changes";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";

const D = 86_400;
const day = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 1000 / D);
const all = JSON.parse(readFileSync(join(__dirname, "fixtures", "fluid-threshold-history.json"), "utf8")) as Record<
  string,
  FluidThresholdHistory
>;
const V = {
  cbBTC: all["0x01c7c1c41dea58b043e700efb23dc077f12a125e"],
  wbtc: all["0x3a0b7c8840d74d39552ef53f586dd8c3d1234c40"],
  eth: all["0xbec491fef7b4f666b270f9d5e5c3f443cbf20991"],
  weeth: all["0x92643e964ca4b2c165a95ca919b0a819aca6d5f1"],
};
const FIRST = {
  2156: { ts: 1727473163, block: 20844706 },
  1334: { ts: 1721489207, block: 20348630 },
  6: { ts: 1709060015, block: 19320802 },
  8538: { ts: 1761059291, block: 23626730 },
};
const flat = (reads: ReturnType<typeof fluidThresholdReads>) =>
  reads?.map((r) => [r.day, r.block, r.line, r.lt.coll]) ?? null;

test("#2156: 85 % at the first event, stepping to 88 % and 90 % on the days governance changed it", () => {
  assert.deepEqual(flat(fluidThresholdReads(V.cbBTC, FIRST[2156])), [
    [day("2024-09-27"), 20781343, 0.85, 0.85],
    [day("2024-10-11"), 20944531, 0.88, 0.88],
    [day("2025-05-21"), 22530524, 0.9, 0.9],
  ]);
});

test("#1334 (closed): 85 %, 88 % from 18 Aug 2024; the change after the close is a read the view never reaches", () => {
  assert.deepEqual(flat(fluidThresholdReads(V.wbtc, FIRST[1334])), [
    [day("2024-07-20"), 20263955, 0.85, 0.85],
    [day("2024-08-18"), 20556431, 0.88, 0.88],
    [day("2025-05-21"), 22530524, 0.9, 0.9],
  ]);
});

test("#6 and #8538: one threshold across the life, the one in force at the first event", () => {
  assert.deepEqual(flat(fluidThresholdReads(V.eth, FIRST[6])), [[day("2024-02-27"), 19311938, 0.9, 0.9]]);
  assert.deepEqual(flat(fluidThresholdReads(V.weeth, FIRST[8538])), [[day("2025-10-21"), 20474088, 0.82, 0.82]]);
});

test("no reads where the history does not reach the first event, is not covered or failed", () => {
  assert.equal(fluidThresholdReads(null, FIRST[6]), null);
  assert.equal(fluidThresholdReads({ ...V.eth, covered: false }, FIRST[6]), null);
  assert.equal(fluidThresholdReads({ ...V.eth, rows: [] }, FIRST[6]), null);
  assert.equal(fluidThresholdReads(V.eth, { ts: 1708000000, block: 19311937 }), null);
  assert.deepEqual(fluidThresholdChanges(null), []);
  assert.deepEqual(fluidThresholdChanges({ ...V.cbBTC, covered: false }), []);
});

test("one marker per change, before → after in percent, at its block, in a receipt", () => {
  const c = fluidThresholdChanges(V.cbBTC);
  assert.deepEqual(
    c.map((x) => [x.day, x.block, x.name, x.from, x.to]),
    [
      [day("2024-10-11"), 20944531, "Liquidation threshold", "85 %", "88 %"],
      [day("2025-05-21"), 22530524, "Liquidation threshold", "88 %", "90 %"],
    ],
  );
  for (const x of c) {
    assert.equal(x.prov.source?.block, x.block);
    assert.equal(x.prov.source?.txHash, x.txHash);
    assert.equal(x.prov.contract?.address, V.cbBTC.vault);
  }
  // The core-settings log moved the collateral factor in the same log.
  assert.match(c[0].prov.summary, /collateral factor from 80 % to 85 %/);
  assert.doesNotMatch(c[1].prov.summary, /collateral factor/);
  // The WBTC vault's three logs in one block: the threshold's alone marks.
  assert.deepEqual(
    fluidThresholdChanges(V.wbtc).map((x) => [x.day, x.from, x.to]),
    [
      [day("2024-08-18"), "85 %", "88 %"],
      [day("2025-05-21"), "88 %", "90 %"],
    ],
  );
  assert.deepEqual(fluidThresholdChanges(V.eth), []);
  // #1334's life holds one; #8538's none.
  assert.deepEqual(
    changesByDay(fluidThresholdChanges(V.wbtc), day("2024-07-20"), day("2024-09-25")).map((d) => d.day),
    [day("2024-08-18")],
  );
  assert.deepEqual(changesByDay(fluidThresholdChanges(V.weeth), day("2025-10-21"), day("2026-10-28")), []);
});

const row = (d: number, coll: number, debt: number) => ({
  day: d,
  events: 1,
  tick: "both" as const,
  cum: {},
  balances: [
    { side: "collateral" as const, asset: "coll", symbol: "WBTC", amount: coll },
    { side: "debt" as const, asset: "debt", symbol: "USDT", amount: debt },
  ],
  prices: [],
});

test("the health view's line and level step on the change's day; a closed life ends on its close", () => {
  const start = day("2024-07-20");
  const change = day("2024-08-18");
  const close = day("2024-09-25");
  const t: FlowTimeline = {
    buckets: [],
    days: [row(start, 1, 30_000), row(close, 0, 0)],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: { coll: [[start, 60_000]], debt: [[start, 1]] },
    today: day("2026-10-28"),
  };
  const reads = fluidThresholdReads(V.wbtc, FIRST[1334])!;
  const hv = healthView(t, reads, { source: FLUID_HISTORY_HEALTH_SOURCE })!;
  const line = hv.health.level!.points;
  assert.equal(hv.health.sparseBefore, undefined);
  assert.equal(line[0][0], start);
  assert.ok(line.every((p) => p[1] === (p[0] < change ? 0.85 : 0.88)));
  assert.equal(line.find((p) => p[0] === change)![2], 20556431);
  // The closing day leaves no debt, so the last point is the day before.
  assert.equal(line[line.length - 1][0], close - 1);
  // 30,000 ÷ 60,000 = 50 % on every day; the level 30,000 ÷ (1 × LT).
  assert.ok(hv.health.points.every((p) => Math.abs(p[1] - 0.5) < 1e-12));
  const lv = hv.marks.coll.level!.points;
  assert.ok(Math.abs(lv.find((p) => p[0] === change - 1)![1] - 30_000 / 0.85) < 1e-6);
  assert.ok(Math.abs(lv.find((p) => p[0] === change)![1] - 30_000 / 0.88) < 1e-6);
});

test("an open life's today is the card's line; the view between the first event and today holds each change", () => {
  const start = day("2024-09-27");
  const today = day("2026-10-28");
  const t: FlowTimeline = {
    buckets: [],
    days: [row(start, 1, 40_000)],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: { coll: [[start, 65_000]], debt: [[start, 1]] },
    today,
  };
  const reads = fluidThresholdReads(V.cbBTC, FIRST[2156])!;
  const hv = healthView(t, reads, {
    source: FLUID_HISTORY_HEALTH_SOURCE,
    liveHf: 0.9 / 0.6,
    liveLine: 0.9,
  })!;
  const at = (d: number) => hv.health.level!.points.find((p) => p[0] === d)![1];
  assert.equal(at(start), 0.85);
  assert.equal(at(day("2024-10-10")), 0.85);
  assert.equal(at(day("2024-10-11")), 0.88);
  assert.equal(at(day("2025-05-20")), 0.88);
  assert.equal(at(day("2025-05-21")), 0.9);
  assert.equal(at(today), 0.9);
  const end = hv.health.points[hv.health.points.length - 1];
  assert.deepEqual([end[0], +end[1].toFixed(9), end[2]], [today, 0.6, null]);
});

test("the how-to-read and receipts say where the line comes from", () => {
  const h = FLUID_HISTORY_HEALTH_SOURCE.ratio!;
  assert.match(h.help, /steps where Fluid governance changed it/);
  assert.match(h.line.summary, /steps on the day Fluid governance changed it/);
  assert.match(FLUID_HISTORY_HEALTH_SOURCE.held!, /in force that day, set at block \{block\}/);
  // The held source keeps today's wording.
  assert.match(FLUID_HEALTH_SOURCE.ratio!.help, /today's liquidation threshold, held across the life/);
  const words = JSON.stringify([FLUID_HISTORY_HEALTH_SOURCE, fluidThresholdChanges(V.cbBTC).map((c) => c.prov)]);
  for (const bad of [/\bfold/i, /footgun/i, /honest/i, /\bitself\b/, /\bexactly\b/, /\bactually\b/, /, not /])
    assert.doesNotMatch(words, bad);
});
