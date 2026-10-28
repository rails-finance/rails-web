// verify-threshold-at-block — the liquidation line read at each picked block
// on Alchemix V3 and Dolomite (lib/alchemix/flows-health.ts,
// lib/dolomite/flows-health.ts; rails-ops ui-jobs 328 step 8,
// reference/lifetime-price-chart.md, the Alchemix and Dolomite rows).
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read from the page's routes on the date the file names
// (scripts/verify/fixtures/threshold-at-block.json): each position's event
// blocks and times, the picks (the last event of each of the latest 60 days
// with events), each pick's answer from /api/chain/alchemix/bound-at-block or
// /api/chain/dolomite/risk-at-block, and the Dolomite core's risk setter logs
// (/api/chain/dolomite/risk-log).
//
// Held: the picks are healthReadPicks' over the events; every day's line is
// the answer of the latest pick on or before it (Alchemix the lower bound,
// Dolomite 1 + the core's ratio for the account), the days before the first
// pick taking its answer, dotted; the markers are the steps (Alchemix, seen
// at a pick) or the setter logs that moved a value on a market the account
// used (Dolomite), each with its before → after; a stepped answer moves the
// line and draws a marker on the pick's day.
//
//   npx tsx --test scripts/verify/verify-threshold-at-block.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEALTH_READS_MAX, healthReadPicks, healthView, type FactorRead } from "@/lib/shared/flows-health";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { ALCHEMIX_DEBT_KEY, ALCHEMIX_MYT_KEY } from "@/lib/alchemix/flows";
import {
  alchemixBoundChanges,
  alchemixBoundRead,
  alchemixHealthSource,
  type AlchemixBoundAt,
} from "@/lib/alchemix/flows-health";
import {
  DOLOMITE_HEALTH_SOURCE,
  dolomiteRiskChanges,
  dolomiteRiskRead,
  type DolomiteRiskAtAnswer,
  type DolomiteRiskLog,
} from "@/lib/dolomite/flows-health";
import { changesByDay } from "@/lib/shared/flows-changes";

const DAY_S = 86_400;

interface Ev {
  block: number;
  ts: number;
}
interface DoloFixture {
  name: string;
  owner: string;
  accountNumber: string;
  events: Ev[];
  markets: Record<string, string>;
  picks: number[];
  answers: Record<string, DolomiteRiskAtAnswer>;
}
interface AlxFixture {
  name: string;
  chain: number;
  line: string;
  token: string;
  alchemist: string;
  events: Ev[];
  picks: number[];
  answers: Record<string, AlchemixBoundAt>;
}
const F = JSON.parse(readFileSync(join(__dirname, "fixtures", "threshold-at-block.json"), "utf8")) as {
  capturedAt: string;
  riskLog: DolomiteRiskLog;
  dolomite: DoloFixture[];
  alchemix: AlxFixture[];
};

const picksOf = (events: readonly Ev[]) =>
  healthReadPicks(
    events.map((e) => ({ blockNumber: e.block, timestamp: e.ts })),
    HEALTH_READS_MAX,
  );

/** One collateral and one debt held flat from the first event's day to the
 *  last, priced 2 and 1: a timeline whose ratio moves with the line alone. */
function flatTimeline(events: readonly Ev[], coll: string, debt: string): FlowTimeline {
  const first = Math.floor(Math.min(...events.map((e) => e.ts)) / DAY_S);
  const last = Math.floor(Math.max(...events.map((e) => e.ts)) / DAY_S);
  return {
    buckets: [],
    days: [
      {
        day: first,
        events: 1,
        tick: "both",
        cum: {},
        balances: [
          { side: "collateral", asset: coll, symbol: "C", amount: 1 },
          { side: "debt", asset: debt, symbol: "D", amount: 1 },
        ],
        prices: [],
      },
      { day: last, events: 1, tick: "both", cum: {}, balances: [], prices: [] },
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: { [coll]: [[first, 2]], [debt]: [[first, 1]] },
    today: last,
  };
}

/** The line each day from the view, and the line wanted: the latest read on
 *  or before the day, the first read before it. */
function checkLine(name: string, t: FlowTimeline, reads: readonly FactorRead[], source = DOLOMITE_HEALTH_SOURCE) {
  const hv = healthView(t, reads, { source });
  assert.ok(hv, `${name}: a view`);
  const pts = hv.health.level!.points;
  assert.ok(pts.length > 0);
  for (const [day, line, block] of pts) {
    const r = [...reads].reverse().find((x) => x.day <= day) ?? reads[0];
    assert.equal(line, r.line, `${name} day ${day}: the line is the read's in force`);
    assert.equal(block, r.block, `${name} day ${day}: at the read's block`);
  }
  const firstDay = pts[0][0];
  if (reads[0].day > firstDay)
    assert.equal(hv.health.sparseBefore, reads[0].day, `${name}: dotted before the first read`);
  else assert.equal(hv.health.sparseBefore, undefined, `${name}: nothing dotted`);
  return hv.health;
}

test("the fixtures carry both families", () => {
  assert.ok(F.dolomite.length >= 3);
  assert.ok(F.alchemix.length >= 4);
  assert.ok(F.riskLog.sets.length > 0);
});

for (const f of F.alchemix) {
  test(`alchemix ${f.name}: the picks, and the line at each pick's lower bound`, () => {
    const picks = picksOf(f.events);
    assert.deepEqual(
      picks.map((p) => p.blockNumber),
      f.picks,
    );
    const reads = picks.map((p) => {
      const a = f.answers[String(p.blockNumber)];
      assert.ok(a && a.lowerBound > 0, `${f.name}: an answer at ${p.blockNumber}`);
      assert.equal(a.block, p.blockNumber);
      return alchemixBoundRead(a, p.timestamp);
    });
    const t = flatTimeline(f.events, ALCHEMIX_MYT_KEY, ALCHEMIX_DEBT_KEY);
    const h = checkLine(f.name, t, reads, alchemixHealthSource(f.chain, "USDC", "mixUSDC"));
    // Collateralisation = 2 ÷ 1 on every day: the line alone moves.
    assert.ok(h.points.every((p) => Math.abs(p[1] - 2) < 1e-12));
    // No step in these lives: the bound has stood at one value, so no marker.
    const bounds = new Set(reads.map((r) => r.line));
    const changes = alchemixBoundChanges(h.level!.points, null, f.alchemist);
    assert.equal(changes.length, bounds.size - 1, `${f.name}: one marker per step`);
  });
}

test("alchemix: a stepped answer moves the line on the pick's day and draws its marker there", () => {
  const f = F.alchemix[0];
  const picks = picksOf(f.events);
  assert.ok(picks.length >= 3);
  const k = Math.floor(picks.length / 2);
  const reads = picks.map((p, i) =>
    alchemixBoundRead(
      { block: p.blockNumber, lowerBound: i >= k ? 1.1 : f.answers[String(p.blockNumber)].lowerBound },
      p.timestamp,
    ),
  );
  const h = checkLine("stepped", flatTimeline(f.events, ALCHEMIX_MYT_KEY, ALCHEMIX_DEBT_KEY), reads);
  const changes = alchemixBoundChanges(h.level!.points, null, f.alchemist);
  assert.equal(changes.length, 1);
  const c = changes[0];
  assert.equal(c.day, Math.floor(picks[k].timestamp / DAY_S));
  assert.equal(c.block, picks[k].blockNumber);
  assert.equal(c.name, "Lower bound");
  assert.equal(c.from, "105.3%");
  assert.equal(c.to, "110.0%");
  assert.match(c.prov.summary, /seen at the read at block/);
  // A step at today's card read is marked at the card's block.
  const today = alchemixBoundChanges(
    [...h.level!.points.slice(0, -1), [h.level!.points.at(-1)![0], 1.2, null]],
    999,
    null,
  );
  assert.equal(today.at(-1)!.block, 999);
  assert.match(today.at(-1)!.prov.summary, /the card's/);
});

for (const f of F.dolomite) {
  test(`dolomite ${f.name}: the picks, and the line at each pick's margin ratio for the account`, () => {
    const picks = picksOf(f.events);
    assert.deepEqual(
      picks.map((p) => p.blockNumber),
      f.picks,
    );
    const reads = picks.map((p) => {
      const a = f.answers[String(p.blockNumber)];
      assert.ok(a && a.marginRatioForAccount > 0, `${f.name}: an answer at ${p.blockNumber}`);
      const r = dolomiteRiskRead(a, p.timestamp);
      assert.equal(r.line, 1 + a.marginRatioForAccount);
      // The override skips the premiums.
      for (const [m, premium] of Object.entries(a.premiums)) {
        const p2 = a.overrideMarginRatio != null ? 0 : premium;
        assert.ok(Math.abs(r.lt[m] - 1 / ((1 + p2) * r.line!)) < 1e-12);
        assert.equal(r.dw?.[m], p2 > 0 ? 1 + p2 : undefined);
      }
      return r;
    });
    // The line's stepping on a flat pair: one collateral counted at
    // 1 ÷ line, so the ratio is 2 on every day and the line alone moves.
    const flat = reads.map((r) => ({ day: r.day, block: r.block, lt: { c: 1 / r.line!, d: 0 }, line: r.line }));
    const h = checkLine(f.name, flatTimeline(f.events, "c", "d"), flat);
    // Margin ratio = 2 ÷ 1 on every day.
    assert.ok(h.points.every((p) => Math.abs(p[1] - 2) < 1e-12));
    // The markers: each setter log that moved a value, on a market the account used.
    const changes = dolomiteRiskChanges(F.riskLog, new Map(Object.entries(f.markets)));
    for (const c of changes) {
      assert.ok(c.from != null && c.from !== c.to);
      if (c.name !== "Margin ratio") assert.ok(Object.values(f.markets).some((s) => c.name === `${s} margin premium`));
    }
    const first = Math.floor(Math.min(...f.events.map((e) => e.ts)) / DAY_S);
    const last = Math.floor(Math.max(...f.events.map((e) => e.ts)) / DAY_S);
    const inLife = changesByDay(changes, first, last).flatMap((d) => d.changes);
    // A premium step inside the life shows in the reads that straddle it.
    for (const c of inLife) {
      const m = Object.entries(f.markets).find(([, s]) => c.name === `${s} margin premium`)?.[0];
      if (!m) continue;
      const before = picks.filter((p) => p.blockNumber < c.block).at(-1);
      const after = picks.find((p) => p.blockNumber >= c.block);
      if (before && after)
        assert.notEqual(
          f.answers[String(before.blockNumber)].premiums[m],
          f.answers[String(after.blockNumber)].premiums[m],
          `${f.name}: ${c.name} moved between the reads`,
        );
    }
  });
}

test("dolomite: the core's setter logs give the one premium step of a listed market and no ratio step after launch", () => {
  const all = dolomiteRiskChanges(F.riskLog, new Map([["6", "weETH"]]));
  const weeth = all.filter((c) => c.name === "weETH margin premium");
  assert.deepEqual(
    weeth.map((c) => [c.block, c.from, c.to]),
    [[24_384_982, "6.25 %", "3.66 %"]],
  );
  const ratio = all.filter((c) => c.name === "Margin ratio");
  assert.deepEqual(
    ratio.map((c) => [c.block, c.from, c.to]),
    [[22_778_154, "15 %", "17.65 %"]],
  );
  // A market the account never used draws no marker.
  assert.equal(
    dolomiteRiskChanges(F.riskLog, new Map([["2", "USDC"]])).filter((c) => c.name !== "Margin ratio").length,
    0,
  );
});

test("dolomite override-step-0x0aaf: the line steps from 111.11 % to 117.65 % at the read that first shows the override gone", () => {
  const f = F.dolomite.find((x) => x.name === "override-step-0x0aaf")!;
  const picks = picksOf(f.events);
  const lines = picks.map((p) => +(1 + f.answers[String(p.blockNumber)].marginRatioForAccount).toFixed(4));
  assert.deepEqual(lines, [1.1111, 1.1765, 1.1765, 1.1765, 1.1765]);
  assert.equal(picks[1].blockNumber, 23_111_921);
  assert.equal(Math.floor(picks[1].timestamp / DAY_S), 20_310);
  // The override is the account's: no setter log moves it, so no marker.
  const changes = dolomiteRiskChanges(F.riskLog, new Map(Object.entries(f.markets)));
  const first = Math.floor(f.events[0].ts / DAY_S);
  assert.equal(changesByDay(changes, first, Math.floor(f.events.at(-1)!.ts / DAY_S)).length, 0);
});

test("dolomite weeth-premium-0x6c26: weETH's premium step is a marker inside the life; the override keeps the line", () => {
  const f = F.dolomite.find((x) => x.name === "weeth-premium-0x6c26")!;
  const changes = dolomiteRiskChanges(F.riskLog, new Map(Object.entries(f.markets)));
  const first = Math.floor(f.events[0].ts / DAY_S);
  const inLife = changesByDay(changes, first, Math.floor(f.events.at(-1)!.ts / DAY_S)).flatMap((d) => d.changes);
  assert.deepEqual(
    inLife.map((c) => [c.block, c.name, c.from, c.to]),
    [[24_384_982, "weETH margin premium", "6.25 %", "3.66 %"]],
  );
  assert.match(inLife[0].prov.summary, /skips the premiums/);
  const lines = new Set(f.picks.map((b) => f.answers[String(b)].marginRatioForAccount));
  assert.equal(lines.size, 1);
  assert.ok(f.picks.every((b) => f.answers[String(b)].overrideMarginRatio != null));
});
