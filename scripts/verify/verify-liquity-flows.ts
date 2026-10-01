// verify-liquity-flows — a Liquity-family Trove's Lifetime flows
// (lib/shared/liquity-flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "The Liquity family").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 30 Sep 2026: three Liquity V2 Troves from
// /api/trove/…/timeline (a WETH Trove redeemed 320 times, an rETH Trove
// redeemed and then liquidated with a surplus to claim, a wstETH batch member
// redeemed to a zombie), and the raw index rows of an Ebisu weETH Trove one
// of whose touches applied a redistribution (V2 has recorded none), run
// through the page's own transform (buildEbisuTimeline).
//
// Held: the replay's token totals meet the last recorded balances on both
// sides; the interest is never negative; and at every event day, a few days
// between, and the live stop, each side's printed lines add to its printed
// total, the remainder named for what it holds. Each event card's sum
// (liquityFocusEvents through lib/shared/flow-focus.ts) is exact at every
// event, its printed lines add to the card's figure, "Since this event" meets
// the bars at later cursor dates, and the daily line meets the bars.
//
//   npx tsx --test scripts/verify/verify-liquity-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isEbisuEvent } from "@/lib/shared/types/event-shape";
import {
  LQ,
  liquityFlowTimeline,
  liquityFocusEvents,
  liquityForkFlowEvents,
  liquityV2FlowEvents,
  replayLiquity,
  type LiquityFlowEvent,
} from "@/lib/shared/liquity-flows";
import { troveLives } from "@/lib/shared/liquity-flows-explanation";
import { buildFlowModel, sideStateFor, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { flowMoment } from "@/lib/shared/flow-moment";
import { sideSumRows, sumBasis } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, sinceEvent } from "@/lib/shared/flow-focus";
import { buildEbisuTimeline, type MvRow } from "@/lib/sources/api/ebisu-timeline";

const FIX = join(__dirname, "fixtures");
const read = (name: string) => JSON.parse(readFileSync(join(FIX, name), "utf8"));

const v2 = (name: string): BaseActivityEvent[] => read(name).events as BaseActivityEvent[];
const REDEEMED = liquityV2FlowEvents(v2("liquity-flows-v2-redeemed.json"));
const LIQUIDATED = liquityV2FlowEvents(v2("liquity-flows-v2-liquidated.json"));
const ZOMBIE = liquityV2FlowEvents(v2("liquity-flows-v2-zombie.json"));
const ebisuRaw = read("liquity-flows-ebisu-redist.json") as { rows: MvRow[]; collateralType: string; troveId: string };
const EBISU = liquityForkFlowEvents(
  buildEbisuTimeline(ebisuRaw.rows, ebisuRaw.collateralType, ebisuRaw.troveId).events,
  isEbisuEvent,
);

/** A fixed clock: noon on 30 Sep 2026. */
const NOW = Date.UTC(2026, 8, 30, 12) / 1000;

const SIDE_BUCKETS = {
  collateral: {
    in: [LQ.deposited, LQ.redistColl],
    out: [LQ.withdrawn, LQ.collRedeemed, LQ.collLiquidated, LQ.surplus],
  },
  debt: {
    in: [LQ.borrowed, LQ.interest, LQ.upfront, LQ.batchFee, LQ.redistDebt],
    out: [LQ.repaid, LQ.debtRedeemed, LQ.debtLiquidated],
  },
} as const;

function totals(events: LiquityFlowEvent[]) {
  const t: Record<string, number> = {};
  let negativeInterest = 0;
  for (const r of replayLiquity(events))
    for (const l of r.legs) {
      t[l.bucket] = (t[l.bucket] ?? 0) + l.amount;
      if ((l.bucket === LQ.interest || l.bucket === LQ.batchFee) && l.amount < -1e-9) negativeInterest++;
    }
  const net = (side: "collateral" | "debt") =>
    SIDE_BUCKETS[side].in.reduce((a, k) => a + (t[k] ?? 0), 0) -
    SIDE_BUCKETS[side].out.reduce((a, k) => a + (t[k] ?? 0), 0);
  return { t, negativeInterest, coll: net("collateral"), debt: net("debt") };
}

function model(events: LiquityFlowEvent[], symbols: [string, string], open: boolean, price = 4000): FlowModel {
  const t = liquityFlowTimeline(events, {
    collSymbol: symbols[0],
    debtSymbol: symbols[1],
    surplusClaimed: false,
    now: NOW,
    live: open ? { price } : null,
  });
  assert.ok(t, "a timeline");
  const m = buildFlowModel(t);
  assert.ok(m, "a model");
  return m;
}

/** Every event day, the days between two of them, and the live stop. */
function cursorStops(m: FlowModel): number[] {
  const stops = new Set<number>([...m.eventDays, m.liveStop]);
  for (let i = 1; i < m.eventDays.length; i++) {
    const gap = m.eventDays[i] - m.eventDays[i - 1];
    if (gap > 2) stops.add(m.eventDays[i - 1] + Math.floor(gap / 2));
  }
  return [...stops].sort((a, b) => a - b);
}

function assertSumsAdd(m: FlowModel, label: string) {
  for (const stop of cursorStops(m)) {
    const st = stateAt(m, stop);
    for (const side of ["collateral", "debt"] as const) {
      const rows = sideSumRows(st[side]);
      const printed = rows.lines.reduce((a, l) => a + l.dollars, 0);
      assert.equal(printed, rows.total.dollars, `${label} ${side} at stop ${stop}: lines add to the total`);
      const rest = rows.lines.find((l) => l.kind === "rest");
      if (rest)
        assert.equal(
          rest.label,
          side === "collateral" ? "Market move" : "Interest since the last event",
          `${label} ${side}: the remainder is named`,
        );
    }
  }
}

for (const [name, events, symbols, open] of [
  ["V2 WETH, redeemed", REDEEMED, ["WETH", "BOLD"], true],
  ["V2 rETH, liquidated", LIQUIDATED, ["rETH", "BOLD"], false],
  ["V2 wstETH, zombie", ZOMBIE, ["wstETH", "BOLD"], true],
  ["Ebisu weETH, redistribution", EBISU, ["weETH", "ebUSD"], true],
] as const) {
  test(`${name}: the replay meets the last recorded balances`, () => {
    const { coll, debt, negativeInterest } = totals(events as LiquityFlowEvent[]);
    const last = replayLiquity(events as LiquityFlowEvent[]).at(-1)!.ev;
    assert.ok(
      Math.abs(coll - last.collAfter) < 1e-9 * Math.max(1, last.collAfter),
      `collateral ${coll} vs ${last.collAfter}`,
    );
    assert.ok(Math.abs(debt - last.debtAfter) < 1e-6, `debt ${debt} vs ${last.debtAfter}`);
    assert.equal(negativeInterest, 0, "no event states negative interest");
  });
  test(`${name}: at every stop each side's printed lines add to its printed total`, () => {
    assertSumsAdd(model(events as LiquityFlowEvent[], symbols as unknown as [string, string], open), name);
  });
}

test("V2 WETH, redeemed: the redemptions sit on both bars, linked", () => {
  const m = model(REDEEMED, ["WETH", "BOLD"], true);
  const st = stateAt(m, m.liveStop);
  const coll = st.collateral.bar.find((s) => s.key === LQ.collRedeemed);
  const debt = st.debt.bar.find((s) => s.key === LQ.debtRedeemed);
  assert.ok(coll && coll.value > 0 && coll.link === "redemption" && coll.tone === "redemption");
  assert.ok(debt && debt.value > 0 && debt.link === "redemption");
  assert.equal(totals(REDEEMED).t[LQ.redistColl] ?? 0, 0);
});

test("V2 rETH, liquidated: the liquidation and its surplus leave the collateral whole", () => {
  const { t } = totals(LIQUIDATED);
  assert.ok((t[LQ.collLiquidated] ?? 0) > 0, "collateral liquidated");
  assert.ok((t[LQ.surplus] ?? 0) > 0, "a surplus to claim");
  assert.ok((t[LQ.debtLiquidated] ?? 0) > 0, "debt liquidated");
  const m = model(LIQUIDATED, ["rETH", "BOLD"], false);
  const end = stateAt(m, m.liveStop);
  assert.equal(Math.round(end.collateral.now), 0, "nothing held after the liquidation");
  assert.equal(Math.round(end.debt.now), 0, "nothing owed");
  assert.equal(m.liveStop, m.lastDay + 1, "a closed Trove's slider stops the day after its last event");
});

test("V2 wstETH, zombie: still holds its collateral, with the batch's fee on its own line", () => {
  const m = model(ZOMBIE, ["wstETH", "BOLD"], true);
  const end = stateAt(m, m.liveStop);
  assert.ok(end.collateral.now > 0, "a zombie still holds collateral");
  assert.ok((totals(ZOMBIE).t[LQ.batchFee] ?? 0) > 0, "a batch member pays the batch's fee");
  assert.equal(troveLives(replayLiquity(ZOMBIE).map((r) => r.ev)), 1);
});

test("Ebisu weETH: the redistribution is its own line on each side", () => {
  const { t } = totals(EBISU);
  assert.ok((t[LQ.redistColl] ?? 0) > 0, "redistribution gains");
  assert.ok((t[LQ.redistDebt] ?? 0) > 0, "redistributed debt");
  const m = model(EBISU, ["weETH", "ebUSD"], true);
  const rows = sideSumRows(stateAt(m, m.liveStop).debt);
  assert.ok(rows.lines.some((l) => l.label === "Redistributed debt"));
});

test("between events the debt grows by the interest its rate builds, and the line carries the last price", () => {
  const m = model(REDEEMED, ["WETH", "BOLD"], true);
  // A stop between two events a week or more apart.
  let at = -1;
  for (let i = 1; i < m.eventDays.length && at < 0; i++)
    if (m.eventDays[i] - m.eventDays[i - 1] >= 7) at = m.eventDays[i - 1] + 5;
  assert.ok(at > 0, "a quiet week");
  const before = stateAt(m, at - 4).debt.now;
  const after = stateAt(m, at).debt.now;
  assert.ok(after > before, "the debt grows between events");
  const t = liquityFlowTimeline(REDEEMED, {
    collSymbol: "WETH",
    debtSymbol: "BOLD",
    surplusClaimed: false,
    now: NOW,
    live: { price: 4000 },
  })!;
  const series = binSeries(binInputFromTimeline(t)!, "week")!;
  assert.equal(series.gaps.length, 0, "the line carries the last recorded price: no gaps");
});

test("the basis line names what each remainder holds", () => {
  const m = model(REDEEMED, ["WETH", "BOLD"], true);
  const st = stateAt(m, m.liveStop);
  assert.equal(
    sumBasis(st.collateral, "Market move", "held", "today"),
    "Each flow is valued at the branch's price when it happened. Market move is the remainder, held today less the lines above it, so it is the change in WETH's price since each flow.",
  );
  assert.match(
    sumBasis(st.debt, "Interest since the last event", "owed", "today"),
    /^Debt is counted at BOLD's \$1 face\. .* so it is the interest built up on the recorded debt since the Trove's last event\.$/,
  );
});

// ── The event card's sum (lib/shared/flow-focus.ts over liquityFocusEvents) ──

for (const [name, events, symbols, open] of [
  ["V2 WETH, redeemed", REDEEMED, ["WETH", "BOLD"], true],
  ["V2 rETH, liquidated", LIQUIDATED, ["rETH", "BOLD"], false],
  ["V2 wstETH, zombie", ZOMBIE, ["wstETH", "BOLD"], true],
  ["Ebisu weETH, redistribution", EBISU, ["weETH", "ebUSD"], true],
] as const) {
  test(`${name}: every event card's sum is exact, and its printed lines add to the printed total`, () => {
    const ev = events as LiquityFlowEvent[];
    const [coll, debt] = symbols as unknown as [string, string];
    const m = model(ev, [coll, debt], open);
    const focus = liquityFocusEvents(ev, coll, debt);
    assert.equal(focus.length, ev.length, "one focus event per Trove event");
    for (const f of focus) {
      const cum = eventCum(m, focus, f.id);
      assert.ok(cum, `${name} ${f.id}: the model holds its day`);
      assert.ok(cum.exact, `${name} ${f.id}: the legs add to the day row's move`);
      for (const side of ["collateral", "debt"] as const) {
        const held = f.sides![side].after;
        const rows = eventSideSum(m, side, cum, held);
        const printed = rows.lines.reduce((a, l) => a + l.dollars, 0);
        assert.equal(printed, rows.total.dollars, `${name} ${f.id} ${side}: lines add to the total`);
        assert.equal(rows.total.dollars, Math.round(held), `${name} ${f.id} ${side}: the total is the card's figure`);
        if (side === "debt") {
          // Interest is exact event by event: nothing is left for the remainder.
          const rest = rows.lines.find((l) => l.kind === "rest");
          assert.ok(!rest || Math.abs(rest.dollars) <= 1, `${name} ${f.id}: no debt remainder (${rest?.dollars})`);
        }
      }
    }
  });
  test(`${name}: "Since this event" at a few cursor dates states the bars' figures`, () => {
    const ev = events as LiquityFlowEvent[];
    const [coll, debt] = symbols as unknown as [string, string];
    const m = model(ev, [coll, debt], open);
    const focus = liquityFocusEvents(ev, coll, debt);
    const first = focus[0];
    const cum = eventCum(m, focus, first.id)!;
    const stops = cursorStops(m).filter((s) => s > cum.stop);
    for (const stop of [stops[0], stops[Math.floor(stops.length / 2)], m.liveStop].filter((s) => s != null)) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const s = sinceEvent(m, side, cum, stop);
        assert.equal(Math.round(s.held), Math.round(st[side].now), `${name} ${side} at ${stop}: held is the bars'`);
        // Each moved line ends where the bar's segment stands.
        for (const l of s.lines) {
          const seg = [...st[side].bar, ...st[side].sources].find((x) => x.key === l.key);
          if (seg) assert.equal(Math.round(l.now), Math.round(seg.value), `${name} ${l.key} at ${stop}`);
        }
      }
    }
  });
}

test("a Trove's day: the card's collateral at the day's last event is the bars' figure that day", () => {
  const m = model(REDEEMED, ["WETH", "BOLD"], true);
  const focus = liquityFocusEvents(REDEEMED, "WETH", "BOLD");
  const lastOfDay = new Map<number, (typeof focus)[number]>();
  for (const f of focus) lastOfDay.set(Math.floor(f.ts / 86_400), f);
  for (const [day, f] of lastOfDay) {
    // Today is valued at the live read's price.
    if (day >= Math.floor(NOW / 86_400)) continue;
    const stop = day - m.start / 86_400_000;
    const now = stateAt(m, stop).collateral.now;
    assert.ok(Math.abs(f.sides!.collateral.after - now) < 1, `day ${day}: ${f.sides!.collateral.after} vs ${now}`);
  }
});

test("the daily line: a life of up to a year is drawn by day on the carried prices, each point the bars' figure", () => {
  for (const [events, sym] of [
    [REDEEMED, "WETH"],
    [EBISU, "weETH"],
  ] as const) {
    const t = liquityFlowTimeline(events as LiquityFlowEvent[], {
      collSymbol: sym,
      debtSymbol: "BOLD",
      surplusClaimed: false,
      now: NOW,
      live: { price: 4000 },
    })!;
    const m = buildFlowModel(t)!;
    const span = t.today! - m.start / 86_400_000;
    const bin = seriesRouteBinFor(span);
    const series = binSeries(binInputFromTimeline(t)!, bin)!;
    assert.equal(series.gaps.length, 0, "no gaps on carried prices");
    if (bin !== "day") continue;
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      const st = stateAt(m, to - m.start / 86_400_000);
      assert.ok(Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6), `coll ${to}`);
      assert.ok(Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1, st.debt.now * 1e-6), `debt ${to}`);
    }
  }
});

for (const [name, events, symbols] of [
  ["V2 WETH, redeemed", REDEEMED, ["WETH", "BOLD"]],
  ["V2 rETH, liquidated", LIQUIDATED, ["rETH", "BOLD"]],
  ["V2 wstETH, zombie", ZOMBIE, ["wstETH", "BOLD"]],
  ["Ebisu weETH", EBISU, ["weETH", "ebUSD"]],
] as const) {
  test(`${name}: the state card between events states the chart's debt and the last event's collateral`, () => {
    const m = model(events as LiquityFlowEvent[], symbols as unknown as [string, string], true);
    const focus = liquityFocusEvents(events as LiquityFlowEvent[], symbols[0], symbols[1]);
    const replayed = replayLiquity(events as LiquityFlowEvent[]);
    const startDay = m.start / 86_400_000;
    const today = Math.floor(NOW / 86_400);
    let checked = 0;
    for (let stop = 1; stop < m.liveStop && startDay + stop < today; stop++) {
      const close = (startDay + stop + 1) * 86_400;
      const mo = flowMoment(m, focus, close - 1);
      if (m.eventDays.includes(stop)) {
        assert.equal(mo, null);
        continue;
      }
      assert.ok(mo, `a moment at stop ${stop}`);
      checked++;
      let last = replayed[0].ev;
      for (const r of replayed) if (r.ev.ts < close) last = r.ev;
      const chart = stateAt(m, stop);
      const coll = mo.sides.collateral;
      const debt = mo.sides.debt;
      // The collateral as the last event left it, in tokens only: no daily price
      // is recorded for the branch.
      if (last.collAfter > 1e-12) {
        assert.equal(coll.assets.length, 1);
        assert.equal(coll.assets[0].tokens, Math.max(0, last.collAfter));
        assert.equal(coll.assets[0].usd, null);
        assert.equal(coll.priced, false);
      } else assert.equal(coll.assets.length, 0);
      // The debt: the recorded debt plus its rate's interest to the day's
      // end, the chart's figure, in tokens at the $1 face.
      if (last.debtAfter > 1e-12) {
        assert.equal(debt.face, true);
        assert.equal(debt.priced, true);
        const tokens = debt.assets[0].tokens;
        assert.ok(Math.abs(tokens - chart.debt.now) <= Math.max(1e-9, chart.debt.now * 1e-12), `debt at stop ${stop}`);
        assert.ok(mo.accrual, "the rate in force");
        const owed = last.debtAfter * mo.accrual.factor;
        assert.ok(Math.abs(tokens - owed) <= Math.max(1e-9, owed * 1e-9), `debt by the rate at stop ${stop}`);
        assert.equal(mo.accrual.rate, last.rate + last.fee);
        // Its sum to that day adds up to what is owed.
        let ri = -1;
        for (let i = 0; i < m.rows.length && m.rows[i].day <= stop; i++) ri = i;
        const rows = sideSumRows(sideStateFor(m, "debt", m.rows[ri].cum, debt.held));
        assert.equal(
          rows.lines.reduce((a, l) => a + l.dollars, 0),
          rows.total.dollars,
        );
      }
    }
    assert.ok(checked > 0, "days between events");
  });
}
