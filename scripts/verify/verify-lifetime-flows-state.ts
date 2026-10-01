// verify-lifetime-flows-state — the date scrubber's state(day) against the
// design brief's reconciliation table and the Lifetime flows ledger, and the
// index's day rows (GET /api/{aave-v3,spark,aave-v4}/flows/daily) against the
// page's events at every event day, with transactions and each asset's part
// (rails-ops reference/lifetime-flows-scrubber.md).
// ----------------------------------------------------------------------------
// OFFLINE. The fixture is the index's answer for Aave V3 Core wallet
// 0xfb9395e0…2a71 (whole history, 63 events), so the ledger
// (computeAaveV3Economics), the adapter (aaveV3FlowTimeline) and the model
// (buildFlowModel / stateAt) all run on the rows the page runs on. The
// lifetime-flows-series-*.json fixtures are the route's answers for that
// wallet and for 0xfb45f0e6…750a (liquidated five times), read on victoria
// 2026-09-29; the liquidated wallet's events come from the shared flow-legs
// fixture's rows. The SparkLend ledger (computeSparkEconomics) is held to the
// route's buckets at the live stop, row by row, on 0x685f…128c (33 treasury
// fees) and 0xe431…239e (spToken transfers), from the rows and from the
// route's `lifetime`. An Aave V3 page served as folders (0xeca2…42dc,
// lifetime-flows-aave-v3-folders-eca2.json, read 2026-09-29) meets the bars
// row by row from the route's `lifetime`, where its own rows do not. On
// 0x685f…128c, whose repayments exceed its borrowing, the debt states no
// negative principal and its lines add to what is owed. The bars' window
// (`windowModel`): its opening segment is what the replay held the day before,
// and every line still adds up to its bar. The Lifetime series
// (lib/shared/flows-series.ts): calendar bins from the open to today, each the
// scrubber's state where the bin's last day recorded every held asset's price,
// and a bin with no price recorded for a held asset a gap.
//
//   npx tsx --test scripts/verify/verify-lifetime-flows-state.ts
import { rewindEvents, rewindRows } from "@/lib/shared/flow-focus";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import type { AaveLaneInterest } from "@/lib/aave-v3/lane-interest";
import { aaveV3LifetimeWithOpening, computeAaveV3Economics } from "@/lib/aave-v3/chain-truth-tower";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import {
  AAVE_V3_FLOW_BUCKETS,
  aaveV3FlowEvents,
  aaveV3FlowSeriesTimeline,
  aaveV3FlowTimeline,
  aaveV3FocusEvents,
  lifetimeFromSeries,
} from "@/lib/aave-v3/flows-timeline";
import type { AaveV3FlowSeries, FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import { sparkRowsToEvents } from "@/lib/sources/api/spark-timeline";
import { sparkFlowEvents, sparkFlowSeriesTimeline } from "@/lib/spark/flows-timeline";
import { computeSparkEconomics } from "@/lib/spark/economics";
import type { SparkPositionView } from "@/components/protocol/spark/spark-position-card";
import type { TowerLine } from "@/lib/shared/chain-truth-economics";
import { aaveV4FlowSeriesTimeline, aaveV4FlowTimeline } from "@/lib/aave-v4/flows-timeline";
import { aaveV3RowsToEvents, type MvRow } from "@/lib/sources/api/aave-v3-timeline";
import {
  oldPriceAt,
  assetsAt,
  axisFor,
  axisLabelOnPhone,
  DAY_MS,
  buildFlowModel,
  daysFromEvents,
  dayStart,
  formatFlowUsd,
  longDay,
  nextEventDay,
  prevEventDay,
  sideStateFor,
  stateAt,
  type FlowAssetHeld,
  type FlowModel,
  type FlowSideState,
  type FlowTimeline,
  windowModel,
} from "@/lib/shared/flows-timeline";
import { formatDate } from "@/lib/date";
import { binUnitFor, flowBins, groupOperations, isBusy, throughput } from "@/lib/shared/flows-busy";
import {
  binInputFromWire,
  binRanges,
  binSeries,
  lifetimeBinFor,
  seriesRouteBinFor,
  weekStart,
  WINDOW_ACTIVE_DAYS,
  windowFromDay,
  type BinInput,
} from "@/lib/shared/flows-series";
import {
  axisSpanDays,
  combinedAt,
  combinedStops,
  eventStep,
  nearestStop,
  stopForDay,
} from "@/lib/shared/flows-combined";
import { apportionDollars, sideSumRows, wholeUsd } from "@/lib/shared/flows-sum";
import { eventCum, eventSideSum } from "@/lib/shared/flow-focus";
import { flowMoment, type FlowMoment, type MomentSide } from "@/lib/shared/flow-moment";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/verify/fixtures/lifetime-flows-aave-v3-fb93.json"), "utf8"),
) as { events: BaseActivityEvent[]; view: AaveV3PositionView; laneInterest: AaveLaneInterest[] };

const tower = computeAaveV3Economics(fixture.view, fixture.events, undefined, undefined, fixture.laneInterest);
const timeline = aaveV3FlowTimeline(fixture.events, tower, fixture.view.priceByAddress);
assert.ok(timeline, "the adapter draws this position");
const model = buildFlowModel(timeline) as FlowModel;
assert.ok(model);

const seg = (s: FlowSideState, key: string) => [...s.bar, ...s.sources].find((x) => x.key === key)?.value ?? 0;
/** To the brief's precision: $k with one decimal. */
const k1 = (v: number) => Math.round(v / 100) / 10;
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const dayOf = (iso: string) => Math.floor((Date.parse(iso) - model.start) / 86_400_000);
const usdSum = (xs: { usd: number | null }[] | undefined) => (xs ?? []).reduce((s, x) => s + (x.usd ?? 0), 0);

test("the live stop meets the brief's reconciliation table", () => {
  const s = stateAt(model, model.liveStop);
  assert.equal(s.count, 63);
  assert.equal(k1(seg(s.collateral, "deposited")), 79.3);
  assert.equal(k1(seg(s.collateral, "received")), 110.0);
  assert.equal(k1(seg(s.collateral, "withdrawn")), 25.8);
  assert.equal(k1(seg(s.collateral, "soldToRepay")), 1.1);
  assert.equal(k1(seg(s.collateral, "withdrawnSwapped")), 57.3);
  assert.equal(k1(seg(s.collateral, "sent")), 5.5);
  assert.equal(k1(seg(s.debt, "borrowed")), 82.8);
  // The brief's Repaid includes the repay with collateral; the bar draws it
  // as its own segment, linked to "Sold to repay".
  assert.equal(k1(seg(s.debt, "repaid") + seg(s.debt, "repaidWithCollateral")), 51.1);
  assert.equal(k1(seg(s.debt, "repaidWithCollateral")), 1.1);
  // Held and owed are live, so they follow prices: the brief's 210.8k and
  // 37.2k were read at other prices. The fixture's read gives these.
  assert.equal(k1(s.collateral.now), 211.5);
  assert.equal(k1(s.debt.now), 37.0);
});

test("the live stop states the ledger's figures", () => {
  const s = stateAt(model, model.liveStop);
  const c = tower.collateral;
  const d = tower.debt;
  assert.ok(near(s.collateral.now, usdSum(c.current)));
  assert.ok(near(s.debt.now, usdSum(d.current) + (d.interest?.usd ?? 0)));
  assert.ok(near(seg(s.collateral, "deposited"), c.lifetimeInflow));
  assert.ok(near(seg(s.collateral, "received"), usdSum(c.received)));
  // One balancing item at every stop: at the live stop it is the ledger's
  // interest and price change added.
  assert.ok(near(seg(s.collateral, "collateral-market"), usdSum(c.earned) + (c.priceChange?.usd ?? NaN), 0.5));
  assert.ok(near(s.collateral.out, usdSum(c.exited) + usdSum(c.liquidated)));
  assert.ok(near(seg(s.debt, "borrowed"), d.lifetimeInflow));
  assert.ok(
    near(seg(s.debt, "debt-market"), (d.interest?.usd ?? 0) + usdSum(d.earned) + (d.priceChange?.usd ?? NaN), 0.5),
  );
  assert.ok(near(s.debt.out, usdSum(d.exited) + usdSum(d.liquidated)));
  for (const side of [s.collateral, s.debt])
    assert.deepEqual(
      side.sources.filter((x) => x.fill === "estimate").map((x) => x.label),
      ["Market move and interest"],
    );
});

test("9 Nov 2025 reads as Miles's screenshot of the prototype", () => {
  const stop = dayOf("2025-11-09T00:00:00Z");
  const s = stateAt(model, stop);
  assert.equal(formatDate(dayStart(model, stop)), "9 Nov 2025");
  assert.equal(s.count, 25);
  assert.equal(formatFlowUsd(s.collateral.now), "$123k");
  assert.equal(formatFlowUsd(s.collateral.total), "$206k");
  assert.equal(formatFlowUsd(s.collateral.out), "$83k");
  assert.equal(formatFlowUsd(s.debt.now), "$48k");
  assert.equal(formatFlowUsd(s.debt.total), "$60k");
  assert.equal(formatFlowUsd(s.debt.out), "$12k");
});

test("solid plus hatched is the in figure, and the sources fill the bar, at every stop", () => {
  for (let stop = 0; stop <= model.liveStop; stop++) {
    const s = stateAt(model, stop);
    for (const side of [s.collateral, s.debt]) {
      const bar = side.bar.reduce((a, x) => a + x.width, 0);
      const src = side.sources.reduce((a, x) => a + x.width, 0);
      assert.ok(near(bar, side.total, 1e-6), `bar at ${stop}`);
      assert.ok(near(src, side.total, 1e-6), `sources at ${stop}`);
      assert.ok(near(side.now + side.out, side.total, 1e-6));
      assert.ok(side.sources.every((x) => x.width >= 0));
      assert.ok(side.total <= model.axis.max, `axis at ${stop}`);
    }
  }
});

test("previous and next visit every event day once, in order, and stop at the ends", () => {
  const seen: number[] = [];
  let stop = 0;
  if (model.eventDays[0] === 0) seen.push(0);
  for (;;) {
    const n = nextEventDay(model, stop);
    if (n === stop || n >= model.liveStop) break;
    seen.push(n);
    stop = n;
  }
  assert.deepEqual(seen, model.eventDays);
  assert.equal(nextEventDay(model, model.eventDays[model.eventDays.length - 1]), model.liveStop);
  const back: number[] = [];
  stop = model.liveStop;
  for (;;) {
    const p = prevEventDay(model, stop);
    back.push(p);
    if (p === 0) break;
    stop = p;
  }
  assert.deepEqual(back.reverse(), model.eventDays);
  assert.equal(prevEventDay(model, 0), 0);
});

test("the stale WBTC price is marked where it steps", () => {
  const oct7 = dayOf("2025-10-07T00:00:00Z");
  assert.ok(
    model.repricings.some((r) => r.day === oct7 && r.symbol === "WBTC" && formatDate(r.from) === "10 Aug 2023"),
  );
  // Before the step, the scrubber names the old price.
  const s = stateAt(model, oct7 - 1);
  assert.ok(s.stale.some((x) => x.symbol === "WBTC" && formatDate(x.pricedAt) === "10 Aug 2023"));
  assert.equal(stateAt(model, model.liveStop).stale.length, 0);
});

test("the axis rule", () => {
  assert.deepEqual(model.axis, { max: 320_000, ticks: [0, 100_000, 200_000, 300_000] });
  assert.deepEqual(axisFor(122_043), { max: 125_000, ticks: [0, 25_000, 50_000, 75_000, 100_000, 125_000] });
});

test("the axis's labels at phone width: the ends always, never two neighbours, the last two steps clear", () => {
  for (let count = 1; count <= 14; count++) {
    const shown = Array.from({ length: count }, (_, i) => i).filter((i) => axisLabelOnPhone(i, count));
    assert.equal(shown[0], 0, `count ${count}: the first`);
    assert.equal(shown[shown.length - 1], count - 1, `count ${count}: the last`);
    if (count <= 5) assert.equal(shown.length, count, `count ${count}: five or fewer all shown`);
    else
      for (let k = 1; k < shown.length; k++)
        assert.ok(shown[k] - shown[k - 1] >= 2, `count ${count}: ${shown.join(",")} has neighbours`);
  }
  // The screenshot wallet's scale: $50k steps, $0 / $100k / $200k / $300k on a phone.
  const { ticks } = axisFor(290_000);
  assert.deepEqual(
    ticks.filter((_, i) => axisLabelOnPhone(i, ticks.length)),
    [0, 100_000, 200_000, 300_000],
  );
});

test("the number format", () => {
  assert.equal(formatFlowUsd(363.4), "$363");
  assert.equal(formatFlowUsd(5_473), "$5.5k");
  assert.equal(formatFlowUsd(123_024), "$123k");
  assert.equal(formatFlowUsd(-5_000), "−$5.0k");
  assert.equal(formatFlowUsd(1_234_567), "$1.2M");
  assert.equal(formatFlowUsd(9_999.7), "$10k");
  assert.equal(formatFlowUsd(1_000_000_000), "$1.0B");
  assert.equal(formatFlowUsd(1_887_545_149), "$1.89B");
  assert.equal(formatFlowUsd(1_500_000_000), "$1.5B");
  assert.equal(formatFlowUsd(999_960_000), "$1.0B");
  assert.equal(formatFlowUsd(999_940_000), "$999.9M");
});

test("the busy treatment: bins, throughput, operations", () => {
  assert.equal(isBusy(model), false);
  // Turnover is measured against the most the collateral has been: one
  // deposit mostly withdrawn is not busy, the same funds cycled six times are.
  const cycled = (n: number) =>
    buildFlowModel({
      buckets: [
        { key: "deposited", label: "Deposited", side: "collateral", dir: "in" },
        { key: "withdrawn", label: "Withdrawn", side: "collateral", dir: "out" },
      ],
      days: Array.from({ length: 2 * n }, (_, i) => ({
        day: 20_000 + i,
        events: i + 1,
        tick: "collateral" as const,
        cum: {
          deposited: Math.ceil((i + 1) / 2) * 1000,
          withdrawn: Math.floor((i + 1) / 2) * (i === 2 * n - 1 ? 980 : 1000),
        },
        balances: [
          {
            asset: "a",
            symbol: "A",
            side: "collateral" as const,
            amount: i % 2 === 0 ? 1000 : i === 2 * n - 1 ? 20 : 0,
          },
        ],
        prices: [{ asset: "a", usd: 1, ts: (20_000 + i) * 86_400 }],
      })),
      live: { collateralUsd: 20, debtUsd: 0 },
    }) as FlowModel;
  assert.equal(isBusy(cycled(1)), false, "deposited once, withdrawn to $20");
  assert.equal(isBusy(cycled(6)), true, "the same $1k in and out six times");
  // The turnover count takes the same base: held down to $20, the $1k cycled
  // six times turned over 6 times (against today's $20 it read 300).
  assert.equal(throughput(cycled(1)).turnover, null, "one deposit is no turnover");
  assert.equal(throughput(cycled(6)).turnover, 6, "turnover against the peak");
  assert.deepEqual(
    [binUnitFor(90), binUnitFor(91), binUnitFor(1095), binUnitFor(1096)],
    ["day", "week", "week", "month"],
  );
  // The bins cover every stop before the live one, once, and count every row.
  const { bins } = flowBins(model);
  assert.equal(bins[0].from, 0);
  assert.equal(bins[bins.length - 1].to, model.liveStop - 1);
  for (let i = 1; i < bins.length; i++) assert.equal(bins[i].from, bins[i - 1].to + 1);
  const last = model.rows[model.rows.length - 1];
  assert.equal(
    bins.reduce((a, b) => a + b.count, 0),
    last.txs ?? last.events,
  );
  assert.equal(throughput(model).txs, model.totalTxs ?? model.totalEvents);
  const ops = groupOperations([
    { txHash: "0x1", actionType: "supply", txFrom: "0xa" },
    { txHash: "0x1", actionType: "borrow", txFrom: "0xa" },
    { txHash: "0x2", actionType: "repay", txFrom: "0xa" },
    { txHash: "0x2", actionType: "withdraw" },
    { txHash: "0x3", actionType: "withdraw" },
    { txHash: "0x4", actionType: "withdraw", txFrom: "0xa" },
    { txHash: "0x4", actionType: "supply" },
    { txHash: "0x4", actionType: "borrow" },
  ]);
  assert.deepEqual(ops?.kinds, [
    { label: "Leverage up", count: 1 },
    { label: "Unwind", count: 1 },
    { label: "Withdraw", count: 1 },
    { label: "Withdraw, supply and borrow", count: 1 },
  ]);
  assert.deepEqual(ops?.executor, { address: "0xa", count: 3, known: 3 });
});

// ── the bars' window and the Lifetime series ────────────────────────────────

test("the window is the last 300 active days, or the whole life", () => {
  assert.equal(WINDOW_ACTIVE_DAYS, 300);
  const days = Array.from({ length: 350 }, (_, i) => 1000 + i * 2);
  assert.equal(windowFromDay(days), days[50]);
  assert.equal(windowFromDay(days.slice(0, 300)), 1000);
  assert.equal(windowFromDay([7]), 7);
  assert.equal(windowFromDay([]), 0);
  assert.equal(longDay(Date.UTC(2025, 2, 3) / 1000), "3 Mar 2025");
  assert.deepEqual([lifetimeBinFor(1095), lifetimeBinFor(1096)], ["week", "month"]);
  // The Aave family's line (a series route) goes by day up to a year.
  assert.deepEqual([0, 365, 366, 1095, 1096].map(seriesRouteBinFor), ["day", "day", "week", "week", "month"]);
  assert.equal(lifetimeBinFor(30), "week", "the rows binned on the page keep weeks");
});

test("the window's opening segment: what was held when it opens, and every length still adds up", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress);
  const full = buildFlowModel(route!) as FlowModel;
  assert.equal(windowModel(full, 0), full, "a window from the first day is the whole model");
  const from = full.eventDays[12];
  const w = windowModel(full, from);
  assert.equal(w.liveStop, full.liveStop - from);
  assert.equal(w.eventDays.length, full.eventDays.filter((d) => d >= from).length);
  assert.equal(w.start, full.start + from * 86_400_000);
  const open = w.opening!;
  assert.ok(open, "a cut model states its opening");
  assert.equal(open.collateral, full.valued[from - 1].collateral);
  assert.equal(open.debt, full.valued[from - 1].debt);
  assert.equal(open.events, stateAt(full, from - 1).count);
  const outs = (st: FlowSideState) => st.bar.filter((x) => x.fill === "out").reduce((a, x) => a + x.value, 0);
  for (let stop = 0; stop <= w.liveStop; stop++) {
    const a = stateAt(w, stop);
    const b = stateAt(full, stop + from);
    const base = stateAt(full, from - 1);
    assert.equal(a.count, b.count, `stop ${stop}: the counts stay whole`);
    for (const side of ["collateral", "debt"] as const) {
      // Held is the full model's; the exits are the window's own.
      assert.ok(near(a[side].now, b[side].now, 1e-6), `stop ${stop}: ${side} held`);
      assert.ok(
        near(outs(a[side]), outs(b[side]) - outs(base[side]), 1e-6),
        `stop ${stop}: ${side} exits since the window`,
      );
      // The line under the bar starts with the opening, and its terms add up to the bar.
      const first = a[side].sources[0];
      assert.equal(first.key, `${side}-opening`);
      assert.equal(first.label, `Held on ${longDay(open.ts)}`);
      assert.equal(first.value, side === "collateral" ? open.collateral : open.debt);
      const sum = a[side].sources.reduce((acc, x) => acc + x.value, 0);
      assert.ok(near(sum, a[side].total, 1e-6), `stop ${stop}: ${side} sources add up to the bar`);
      assert.ok(near(a[side].total, a[side].now + outs(a[side]), 1e-6));
    }
  }
  // The density strip counts only the window's transactions.
  const { bins } = flowBins(w);
  const last = full.rows[full.rows.length - 1];
  assert.equal(
    bins.reduce((acc, b) => acc + b.count, 0),
    (last.txs ?? last.events) - (open.txs ?? open.events),
  );
  assert.equal(throughput(w).txs, (full.totalTxs ?? full.totalEvents) - (open.txs ?? open.events));
});

// ── the segment panel's sum ─────────────────────────────────────────────────

/** Reads the panel's printed sum back: each line's sign and figure, and the
 *  total, as the reader would add them. */
const printedAdds = (st: FlowSideState): { lines: number; total: number; text: string } => {
  const rows = sideSumRows(st);
  const dollars = (amount: string) => Number(amount.replace(/[$,]/g, ""));
  const lines = rows.lines.reduce((a, l) => a + (l.sign === "−" ? -1 : 1) * dollars(l.amount), 0);
  const text = rows.lines.map((l) => `${l.sign}${l.label} ${l.amount}`).join(" · ") + ` = ${rows.total.amount}`;
  return { lines, total: dollars(rows.total.amount), text };
};

test("the panel's sum: the printed lines add to the printed held figure, on plain, windowed and busy bars", () => {
  const check = (m: FlowModel, stops: number[], what: string) => {
    for (const stop of stops)
      for (const side of ["collateral", "debt"] as const) {
        const st = stateAt(m, stop)[side];
        if (!(st.total > 0)) continue;
        const p = printedAdds(st);
        assert.equal(p.lines, p.total, `${what} at stop ${stop}, ${side}: ${p.text}`);
        assert.equal(p.total, Math.round(st.now), `${what} at stop ${stop}, ${side}: the total is what is held`);
        const rows = sideSumRows(st);
        // The first line reads unsigned; each later one carries its sign.
        assert.ok(
          rows.lines.slice(1).every((l) => l.sign !== ""),
          `${what} at stop ${stop}, ${side}: signs`,
        );
        // Only the balancing item is a remainder, and it comes last.
        assert.ok(rows.lines.filter((l) => l.kind === "rest").length <= 1);
        if (rows.lines.some((l) => l.kind === "rest")) assert.equal(rows.lines[rows.lines.length - 1].kind, "rest");
        // The outflows come in the bar's order.
        const outs = rows.lines.filter((l) => l.kind === "out").map((l) => l.key);
        const bar = st.bar.filter((x) => outs.includes(x.key)).map((x) => x.key);
        assert.deepEqual(outs, bar, `${what} at stop ${stop}, ${side}: the bar's order`);
      }
  };
  // Plain bars, whole life: 9 Nov 2025 (Miles's screenshot), a liquidation-free
  // stop early on, and the live stop.
  check(model, [dayOf("2025-11-09T00:00:00Z"), model.eventDays[3], model.liveStop], "0xfb93, whole");
  // The bars' window: the sum opens with what was held when it opens.
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const full = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const w = windowModel(full, full.eventDays[12]);
  check(w, [0, Math.floor(w.liveStop / 2), w.liveStop], "0xfb93, windowed");
  assert.equal(sideSumRows(stateAt(w, 0).collateral).lines[0].kind, "opening");
  // A busy window: the same $1k cycled forty times, held at $20 with a price
  // off the dollar, so every line rounds.
  const busy = buildFlowModel({
    buckets: [
      { key: "deposited", label: "Deposited", side: "collateral", dir: "in" },
      { key: "withdrawn", label: "Withdrawn", side: "collateral", dir: "out" },
    ],
    days: Array.from({ length: 80 }, (_, i) => ({
      day: 20_000 + i,
      events: i + 1,
      tick: "collateral" as const,
      cum: {
        deposited: Math.ceil((i + 1) / 2) * 1000.37,
        withdrawn: Math.floor((i + 1) / 2) * (i === 79 ? 980.61 : 1000.29),
      },
      balances: [{ asset: "a", symbol: "A", side: "collateral" as const, amount: i % 2 === 0 ? 1000 : 20 }],
      prices: [{ asset: "a", usd: 1 + i / 997, ts: (20_000 + i) * 86_400 }],
    })),
    live: { collateralUsd: 20.49, debtUsd: 0 },
  }) as FlowModel;
  assert.equal(isBusy(busy), true);
  check(busy, [0, 1, 17, 40, 78, busy.liveStop], "busy");
  // Every figure is whole dollars, and the held assets add to the total.
  assert.equal(wholeUsd(79_411.6), "$79,412");
  assert.equal(wholeUsd(-90_118.2), "$90,118");
  assert.deepEqual(apportionDollars([150_920.6, 12_714.7], 163_635), [150_920, 12_715]);
  const parts = apportionDollars([0.4, 0.4, 0.4], 1);
  assert.equal(
    parts.reduce((a, v) => a + v, 0),
    1,
  );
});

test("the Lifetime series: calendar bins from the open to today, each at the replay's balances and its last recorded price", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const input = binInputFromWire(series);
  const route = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const first = series.days[0][0];
  for (const bin of ["day", "week", "month"] as const) {
    const out = binSeries(input, bin)!;
    assert.equal(out.first, first);
    assert.equal(out.points[0][0], first, `${bin}: the first bin starts at the open`);
    assert.equal(out.points[out.points.length - 1][1], series.today, `${bin}: the last ends today`);
    for (let i = 1; i < out.points.length; i++) {
      assert.equal(out.points[i][0], out.points[i - 1][1] + 1, `${bin}: bins are contiguous`);
      if (bin === "day") assert.equal(out.points[i][0], out.points[i][1], "a day is one day");
      else if (bin === "week") assert.equal(weekStart(out.points[i][0]), out.points[i][0], "weeks start on Monday");
      else assert.equal(new Date(out.points[i][0] * 86_400_000).getUTCDate(), 1, "months start on the 1st");
    }
    // Where every held asset recorded its price on the bin's last day, the bin
    // is the scrubber's state at that day: the same replay, the same price.
    let checked = 0;
    for (const [from, to, coll, debt] of out.points) {
      if (to >= series.today) continue;
      const stop = to - first;
      const held = route.heldAt[Math.min(stop, route.heldAt.length - 1)] ?? [];
      const allOnDay = held
        .filter((h) => (h.amount ?? 0) > 0)
        .every((h) => {
          const asset = Object.keys(input.symbols).find((a) => input.symbols[a] === h.symbol)!;
          return (input.prices[asset] ?? []).some(([d]) => d === to);
        });
      if (!allOnDay || stop >= route.valued.length) continue;
      assert.ok(from <= to);
      assert.ok(
        coll != null && near(coll, route.valued[stop].collateral, Math.max(0.01, coll * 1e-7)),
        `${bin} ${to}: held`,
      );
      assert.ok(debt != null && near(debt, route.valued[stop].debt, Math.max(0.01, debt * 1e-7)), `${bin} ${to}: owed`);
      checked++;
    }
    assert.ok(checked > 0, `${bin}: some bins checked against the scrubber`);
    assert.ok(
      out.points.length <= Math.ceil((series.today - first) / (bin === "day" ? 1 : bin === "week" ? 7 : 28)) + 1,
    );
  }
});

test("the Lifetime series: a bin with no price recorded for a held asset is a gap, never the older price", () => {
  const monday = weekStart(20_000);
  const input: BinInput = {
    days: [
      {
        day: monday,
        balances: [
          { side: "collateral", asset: "a", amount: 2 },
          { side: "debt", asset: "b", amount: 5 },
        ],
      },
      { day: monday + 16, balances: [{ side: "collateral", asset: "a", amount: 3 }] },
    ],
    prices: {
      a: [
        [monday - 3, 9],
        [monday + 2, 10],
        [monday + 17, 12],
      ],
      b: Array.from({ length: 30 }, (_, i) => [monday + i, 1] as [number, number]),
    },
    symbols: { a: "AAA", b: "BBB" },
    today: monday + 24,
  };
  const out = binSeries(input, "week")!;
  assert.deepEqual(
    out.points.map(([from, to]) => [from - monday, to - monday]),
    [
      [0, 6],
      [7, 13],
      [14, 20],
      [21, 24],
    ],
  );
  assert.deepEqual(
    out.points.map(([, , c, d]) => [c, d]),
    [
      [20, 5],
      [null, 5], // AAA recorded no price that week: a gap on its side only
      [36, 5],
      [null, 5],
    ],
  );
  assert.deepEqual(out.gaps, [
    [1, "collateral", "AAA"],
    [3, "collateral", "AAA"],
  ]);
  assert.deepEqual(binRanges(monday + 3, monday + 3, "week"), [[monday + 3, monday + 3]]);
});

test("Combined: the cursor stops on the line's points and every day with events", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const full = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const startDay = full.start / DAY_MS;
  for (const bin of ["day", "week", "month"] as const) {
    const line = binSeries(binInputFromWire(series), bin)!;
    const from = full.eventDays[12];
    const stops = combinedStops(full, line, from);
    const days = stops.map((s) => s.stop);
    assert.deepEqual(
      days,
      [...new Set(days)].sort((x, y) => x - y),
      `${bin}: ascending, one stop per day`,
    );
    const last = stops[stops.length - 1];
    assert.ok(last.live && last.stop === full.liveStop && last.point === line.points.length - 1, `${bin}: today last`);
    // Every point of the line but today's is a stop, at the point's last day.
    line.points.slice(0, -1).forEach(([, to], i) => {
      const at = stops.find((s) => s.point === i);
      assert.ok(at, `${bin}: point ${i} is a stop`);
      assert.equal(at.stop, to - startDay);
    });
    // Every day with events is a stop, marked as one.
    for (const d of full.eventDays) {
      if (d >= full.liveStop) continue;
      const at = stops.find((s) => s.stop === d);
      assert.ok(at?.event, `${bin}: event day ${d} is a stop`);
    }
    // Nothing else: a stop is a point's day, an event day or today.
    for (const s of stops) assert.ok(s.live || s.point != null || s.event, `${bin}: stop ${s.stop} has a reason`);
    assert.equal(
      stops.length,
      new Set([...line.points.slice(0, -1).map(([, to]) => to - startDay), ...full.eventDays]).size + 1,
    );
    // Snapping: each stop is its own nearest; a day between two stops goes to the nearer.
    stops.forEach((s, i) => assert.equal(nearestStop(stops, s.stop), i));
    for (let i = 1; i < stops.length; i++) {
      const [a, b] = [stops[i - 1].stop, stops[i].stop];
      if (b - a < 3) continue;
      assert.equal(nearestStop(stops, a + 1), i - 1);
      assert.equal(nearestStop(stops, b - 1), i);
    }
    assert.equal(nearestStop(stops, -5), 0);
    assert.equal(nearestStop(stops, full.liveStop + 5), stops.length - 1);
  }
  // Without the series: the event days and today.
  const bare = combinedStops(full, null, 0);
  assert.deepEqual(
    bare.map((s) => s.stop),
    [...full.eventDays.filter((d) => d < full.liveStop), full.liveStop],
  );
});

test("Combined: the back and forward steps go by days with events; a day's mark lands on its day's close", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const full = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const line = binSeries(binInputFromWire(series), "week")!;
  const stops = combinedStops(full, line, 0);
  const last = stops.length - 1;
  // Forward from the first stop visits every event day once, in order, then today.
  const visited: number[] = [];
  for (let at = 0, next = eventStep(stops, 0, 1); next !== at; at = next, next = eventStep(stops, at, 1))
    visited.push(stops[next].stop);
  const days = full.eventDays.filter((d) => d < full.liveStop);
  assert.deepEqual(visited, [...days.filter((d) => d > stops[0].stop), full.liveStop]);
  // Back from today visits them the other way, and stops at the first.
  const back: number[] = [];
  for (let at = last, prev = eventStep(stops, last, -1); prev !== at; at = prev, prev = eventStep(stops, at, -1))
    back.push(stops[prev].stop);
  assert.deepEqual(
    back,
    [...days].reverse().filter((d) => d !== stops[last].stop),
  );
  // A point of the line between events is stepped over.
  const between = stops.findIndex((s) => !s.event && !s.live);
  assert.ok(between > 0, "the weekly line has a point between events");
  assert.ok(stops[eventStep(stops, between, 1)].event || stops[eventStep(stops, between, 1)].live);
  // Every event day's mark finds that day's stop; today or later finds the live stop.
  for (const d of days) assert.equal(stops[stopForDay(stops, d)!].stop, d);
  assert.equal(stopForDay(stops, full.liveStop + 3), last);
});

test("Combined: on a daily line a day's mark lands on that day's point", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const full = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const line = binSeries(binInputFromWire(series), "day")!;
  const stops = combinedStops(full, line, 0);
  const startDay = full.start / DAY_MS;
  // Every day of the life before today is a stop on its day's point (today's
  // point is the live stop's).
  for (let d = 0; startDay + d < line.today; d++) {
    const at = stops[stopForDay(stops, d)!];
    assert.equal(at.stop, d);
    assert.ok(at.point != null && line.points[at.point][1] === startDay + d, `day ${d} is its point`);
  }
});

test("the rewind: the list up to a day's close, its rows moved up by what was cut", () => {
  const ev = (id: string, timestamp: number) => ({ id, timestamp });
  // Newest first, as the timeline draws them.
  const events = [ev("e", 500), ev("d", 400), ev("c", 300), ev("b", 200), ev("a", 100)];
  assert.deepEqual(
    rewindEvents(events, 350).map((e) => e.id),
    ["c", "b", "a"],
  );
  assert.equal(rewindEvents(events, null), events, "no cut, the list whole");
  assert.deepEqual(rewindEvents(events, 50), [], "before the first event, nothing");
  // Rows over it: a folder (oldest 250, newest 450) straddles a cut at 350
  // and stays, first; the event rows newer than the cut go, and each row
  // left moves up by the cut events above it.
  type Row = { id: string; flatIdx: number; oldest: number };
  const rows: Row[] = [
    { id: "e", flatIdx: 0, oldest: 500 },
    { id: "folder", flatIdx: 1, oldest: 250 },
    { id: "d", flatIdx: 1, oldest: 400 },
    { id: "c", flatIdx: 2, oldest: 300 },
    { id: "a", flatIdx: 3, oldest: 100 },
  ];
  const cutOff = events.length - rewindEvents(events, 350).length;
  assert.deepEqual(
    rewindRows(rows, 350, (r) => r.oldest, cutOff).map((r) => [r.id, r.flatIdx]),
    [
      ["folder", 0],
      ["c", 0],
      ["a", 1],
    ],
  );
  assert.equal(
    rewindRows(rows, null, (r) => r.oldest, 0),
    rows,
  );
});

test("Combined: the strip's time axis spans a week at least, and a longer life whole", () => {
  const d = 20_361; // 30 Sep 2025, any day serves
  // A life of one day, today: the day takes a seventh of the axis after the
  // lead-in, and the rest stays empty past today's close.
  assert.equal(axisSpanDays(d, d), 7);
  // Three days: three sevenths.
  assert.equal(axisSpanDays(d, d + 2), 7);
  // Two event days a week apart, and a long life: the life, as before.
  assert.equal(axisSpanDays(d, d + 7), 8);
  assert.equal(axisSpanDays(d, d + 400), 401);
});

test("Combined: the headlines and the bars state one figure at every stop, between events, on event days and outside the window", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const full = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  // A life of more than three years: the line is monthly, so every event day
  // but a month's last falls between the line's points.
  const bin = lifetimeBinFor(series.today - full.start / DAY_MS);
  assert.equal(bin, "month", "a long position");
  const line = binSeries(binInputFromWire(series), bin)!;
  // A window opening on the 13th active day, so the early months fall before it.
  const from = full.eventDays[12];
  const bars = windowModel(full, from);
  const stops = combinedStops(full, line, from);
  const events = new Set(full.eventDays);
  const rowOf = new Map(full.rows.map((r) => [r.day, r]));
  const amounts = (stop: number) =>
    full.heldAt[stop]
      .map((h) => `${h.side}:${h.symbol}:${h.amount}`)
      .sort()
      .join("|");
  let between = 0;
  let outside = 0;
  let onEvent = 0;
  let lineChecked = 0;
  stops.forEach((at, i) => {
    const { head, bars: b } = combinedAt(full, bars, at);
    if (at.stop < from) {
      assert.equal(at.barStop, null, `stop ${i}: before the window the bars have no stop`);
      assert.equal(b, null);
      outside++;
      return;
    }
    assert.equal(at.barStop, at.stop - from);
    assert.ok(b);
    for (const side of ["collateral", "debt"] as const) {
      assert.ok(near(head[side].now, b[side].now, 1e-6), `stop ${i}: ${side} headline and bar agree`);
      // The solid part of the bar is the headline's figure.
      const held = b[side].bar.find((x) => x.fill === "held")?.value ?? 0;
      assert.ok(near(held, head[side].now, 1e-6), `stop ${i}: ${side} solid part is the headline`);
    }
    if (at.live) return;
    if (at.event) {
      // An event day inside a month: the day's own balances, at its prices.
      assert.ok(events.has(at.stop));
      const row = rowOf.get(at.stop)!;
      assert.equal(head.count, row.events, `stop ${i}: the day's events are counted`);
      if (at.point == null) onEvent++;
    } else {
      const prev = full.eventDays.filter((d) => d < at.stop).pop()!;
      assert.equal(amounts(at.stop), amounts(prev), `stop ${i}: the makeup is the last event's`);
      between++;
    }
    // The line's point, where priced, is the same figure.
    if (at.point != null) {
      const [, , coll, debt] = line.points[at.point];
      if (coll != null && debt != null) {
        assert.ok(near(coll, head.collateral.now, Math.max(0.01, coll * 1e-6)), `stop ${i}: the line's held`);
        assert.ok(near(debt, head.debt.now, Math.max(0.01, debt * 1e-6)), `stop ${i}: the line's owed`);
        lineChecked++;
      }
    }
  });
  assert.ok(between > 0, "some stops fall between events");
  assert.ok(onEvent > 0, "some stops are event days inside a month");
  assert.ok(outside > 0, "some stops fall before the window");
  assert.ok(lineChecked > 0, "some points checked against the line");
});

// ── the route's day rows ────────────────────────────────────────────────────

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(process.cwd(), "scripts/verify/fixtures", name), "utf8")) as T;

/** The event-level answer and the route's, on the same footing: no daily
 *  prices, one live stop, so every event day is valued at its events' prices. */
function sameFooting(t: FlowTimeline): FlowTimeline {
  return { ...t, dailyPrices: undefined, today: undefined };
}

function assertDaysMatch(name: string, reference: FlowModel, route: FlowModel) {
  assert.deepEqual(route.eventDays, reference.eventDays, `${name}: the same active days`);
  assert.equal(route.start, reference.start);
  assert.equal(route.totalTxs, reference.totalTxs, `${name}: transactions`);
  for (const day of reference.eventDays) {
    const a = stateAt(reference, day);
    const b = stateAt(route, day);
    assert.equal(b.count, a.count, `${name} day ${day}: events`);
    assert.equal(b.txs, a.txs, `${name} day ${day}: transactions`);
    // Each asset's part: held at the day's end, and each bucket by symbol.
    const pa = assetsAt(reference, day);
    const pb = assetsAt(route, day);
    for (const h of pa.held) {
      const o = pb.held.find((x) => x.side === h.side && x.symbol === h.symbol);
      assert.ok(o && near(o.usd, h.usd, Math.max(0.02, h.usd * 1e-9)), `${name} day ${day}: ${h.symbol} held`);
    }
    for (const [bucket, parts] of pa.flows)
      for (const p of parts) {
        const o = pb.flows.get(bucket)?.find((x) => x.symbol === p.symbol);
        assert.ok(o && near(o.usd, p.usd, 0.02), `${name} day ${day}: ${bucket} ${p.symbol}`);
      }
    for (const side of ["collateral", "debt"] as const) {
      assert.ok(near(b[side].now, a[side].now, Math.max(0.02, a[side].now * 1e-9)), `${name} day ${day}: ${side} held`);
      for (const seg of [...a[side].bar, ...a[side].sources]) {
        const other = [...b[side].bar, ...b[side].sources].find((x) => x.key === seg.key);
        assert.ok(other && near(other.value, seg.value, 0.02), `${name} day ${day}: ${seg.key}`);
      }
    }
  }
}

test("the route's day rows reproduce the event-level answer at every event day: 0xfb9395e0…2a71", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress);
  assert.ok(route);
  assert.equal(series.unpricedLegs, 0);
  const a = buildFlowModel(sameFooting(timeline!)) as FlowModel;
  const b = buildFlowModel(sameFooting(route)) as FlowModel;
  assertDaysMatch("fb93", a, b);
  // The live stop is the ledger's in both.
  const la = stateAt(a, a.liveStop);
  const lb = stateAt(b, b.liveStop);
  assert.ok(near(lb.collateral.now, la.collateral.now) && near(lb.debt.now, la.debt.now));
});

test("the route's day rows reproduce the event-level answer at every event day: 0xfb45f0e6…750a, liquidated", () => {
  const legs = readJson<{
    tokens: Record<string, { symbol: string; decimals: number }>;
    cases: { wallet: string; rows: MvRow[] }[];
  }>("aave-v3-flow-legs.json");
  const c = legs.cases.find((x) => x.wallet === "0xfb45f0e612424104753f2e2fc9507b3d082e750a")!;
  const metas = new Map(
    Object.entries(legs.tokens).map(([address, t]) => [
      address,
      { address, symbol: t.symbol, decimals: t.decimals, lt: null },
    ]),
  );
  const flows = aaveV3FlowEvents(aaveV3RowsToEvents(c.rows, c.wallet, metas).events, undefined);
  assert.ok(flows);
  const live = { collateralUsd: 0, debtUsd: 0 };
  const reference: FlowTimeline = {
    buckets: AAVE_V3_FLOW_BUCKETS.filter((b) => flows.used.has(b.key)),
    days: daysFromEvents(
      AAVE_V3_FLOW_BUCKETS.map((b) => b.key),
      flows.events,
    ),
    live,
  };
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb45.json");
  const route = aaveV3FlowSeriesTimeline(series, null, undefined);
  assert.ok(route);
  const a = buildFlowModel(reference) as FlowModel;
  const b = buildFlowModel({ ...sameFooting(route), live }) as FlowModel;
  assertDaysMatch("fb45", a, b);
  assert.ok(b.ticks.filter((t) => t.tick === "liquidation").length >= 1, "liquidation days tick red");
});

test("with daily prices the stale WBTC step is gone and the slider runs to today", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!;
  const m = buildFlowModel(route) as FlowModel;
  assert.ok(m.daily);
  // Every reserve this wallet held recorded a price every day it was held.
  assert.deepEqual(
    Object.values(series.prices).map((p) => p.maxGapDays),
    Object.values(series.prices).map(() => 0),
  );
  assert.equal(m.repricings.length, 0);
  for (let stop = 0; stop < m.liveStop; stop++) assert.equal(stateAt(m, stop).stale.length, 0);
  // The last event is today's, so the live stop follows it; with none today
  // it would be today's own stop.
  assert.equal(m.liveStop, Math.max(m.lastDay + 1, series.today - Math.floor(m.start / 86_400_000)));
  // Between events a quiet WBTC balance now moves with the market. On the
  // day before the old step the event prices valued it at August 2023's
  // price; the daily series values it at that day's. On the step's own day
  // both read that day's prices: the event's block against the day's end.
  const oct7 = Math.floor((Date.parse("2025-10-07T00:00:00Z") - m.start) / 86_400_000);
  const stale = stateAt(model, oct7 - 1).collateral.now;
  const daily = stateAt(m, oct7 - 1).collateral.now;
  assert.ok(daily > 3 * stale, `the day before: ${stale} at event prices, ${daily} at daily prices`);
  const a = stateAt(model, oct7).collateral.now;
  const b = stateAt(m, oct7).collateral.now;
  assert.ok(Math.abs(a - b) / a < 0.05, `the step's day: ${a} and ${b}`);
});

test("a gap past SERIES_GAP_DAYS keeps the older price and marks the refresh", () => {
  const t: FlowTimeline = {
    buckets: [{ key: "deposited", label: "Deposited", side: "collateral", dir: "in" }],
    days: [
      {
        day: 1000,
        events: 1,
        tick: "collateral",
        cum: { deposited: 100 },
        balances: [{ asset: "0xa", symbol: "A", side: "collateral", amount: 1 }],
        prices: [{ asset: "0xa", usd: 100, ts: 1000 * 86_400 + 60 }],
      },
    ],
    live: { collateralUsd: 300, debtUsd: 0 },
    dailyPrices: {
      "0xa": [
        [1000, 100],
        [1001, 110],
        [1020, 300],
      ],
    },
    today: 1030,
  };
  const m = buildFlowModel(t) as FlowModel;
  assert.equal(stateAt(m, 1).collateral.now, 110);
  assert.equal(stateAt(m, 8).stale.length, 0);
  assert.equal(stateAt(m, 9).stale[0]?.symbol, "A");
  assert.equal(stateAt(m, 19).collateral.now, 110);
  assert.equal(stateAt(m, 20).collateral.now, 300);
  assert.equal(stateAt(m, 20).stale.length, 0);
  assert.deepEqual(m.repricings, [{ day: 20, symbol: "A", from: 1001 * 86_400 }]);
  // The readout's label: "Old price" through the gap, "Repriced" on the step.
  assert.equal(oldPriceAt(m, 8), null);
  assert.deepEqual(oldPriceAt(m, 9), { word: "Old price", lines: ["No newer price recorded: A from 28 Sep '72."] });
  assert.deepEqual(oldPriceAt(m, 20), { word: "Repriced", lines: ["A repriced on this day, last priced 28 Sep '72."] });
  assert.equal(oldPriceAt(m, m.liveStop), null);
});

// ── SparkLend and Aave V4: the route against the event-level answer ─────────

test("SparkLend: the route's day rows reproduce the event-level answer at every event day, liquidated 33 times", () => {
  const legs = readJson<{
    tokens: Record<string, { symbol: string; decimals: number }>;
    cases: { wallet: string; rows: Parameters<typeof sparkRowsToEvents>[0] }[];
  }>("spark-flow-legs.json");
  const metas = new Map(Object.entries(legs.tokens).map(([address, t]) => [address, { address, ...t, named: true }]));
  for (const [wallet, file] of [
    ["0x685ffd82e8395229974a4dc4e9034fe6108f128c", "lifetime-flows-series-spark-685f.json"],
    ["0xe4317db5791ea5de9209b9839898ef65522b239e", "lifetime-flows-series-spark-e431.json"],
  ]) {
    const c = legs.cases.find((x) => x.wallet === wallet)!;
    const flows = sparkFlowEvents(sparkRowsToEvents(c.rows, wallet, metas).events, undefined);
    assert.ok(flows);
    const live = { collateralUsd: 0, debtUsd: 0 };
    const reference: FlowTimeline = {
      buckets: AAVE_V3_FLOW_BUCKETS.filter((b) => flows.used.has(b.key)),
      days: daysFromEvents(
        AAVE_V3_FLOW_BUCKETS.map((b) => b.key),
        flows.events,
      ),
      live,
    };
    const route = sparkFlowSeriesTimeline(readJson<FlowSeries>(file), null, undefined);
    assert.ok(route);
    const a = buildFlowModel(reference) as FlowModel;
    const b = buildFlowModel({ ...sameFooting(route), live }) as FlowModel;
    assertDaysMatch(wallet.slice(0, 10), a, b);
    if (wallet.startsWith("0x685f"))
      assert.ok(
        b.ticks.some((t) => t.tick === "liquidation"),
        "liquidation days tick red",
      );
  }
});

/** One SparkLend case from the shared flow-legs fixture: its events, the
 *  route's answer, today's prices and what the position holds and owes after
 *  its last row. */
function sparkCase(wallet: string, file: string) {
  const legs = readJson<{
    tokens: Record<string, { symbol: string; decimals: number }>;
    cases: { wallet: string; rows: Parameters<typeof sparkRowsToEvents>[0] }[];
  }>("spark-flow-legs.json");
  const metas = new Map(Object.entries(legs.tokens).map(([address, t]) => [address, { address, ...t, named: true }]));
  const c = legs.cases.find((x) => x.wallet === wallet)!;
  const events = sparkRowsToEvents(c.rows, wallet, metas).events;
  const series = readJson<FlowSeries>(file);
  // Today's prices: the series' latest per asset, else the last event's.
  const prices: Record<string, number> = {};
  for (const d of series.days) for (const [asset, usd] of d[5]) prices[asset] = usd;
  for (const [asset, p] of Object.entries(series.prices)) prices[asset] = p.obs[p.obs.length - 1][1];
  // What the position holds and owes: each reserve's balance after its last row.
  const held = new Map<string, { side: "supply" | "debt"; raw: string }>();
  for (const r of c.rows as unknown as Record<string, string | null>[]) {
    const set = (side: "supply" | "debt", asset: string | null, raw: string | null) => {
      if (asset && raw != null) held.set(`${side}:${asset}`, { side, raw });
    };
    if (r.action === "liquidation") {
      set("supply", r.collateral_asset, r.supply_after);
      set("debt", r.debt_asset ?? r.reserve, r.debt_after);
    } else if (["supply", "withdraw", "transfer_in", "transfer_out"].includes(r.action ?? ""))
      set("supply", r.reserve, r.supply_after);
    else set("debt", r.reserve, r.debt_after);
  }
  const reserves = (side: "supply" | "debt") =>
    [...held]
      .filter(([, v]) => v.side === side && v.raw !== "0")
      .map(([k, v]) => {
        const address = k.slice(k.indexOf(":") + 1);
        const t = legs.tokens[address];
        return {
          symbol: t.symbol,
          address,
          decimals: t.decimals,
          amount: Number(v.raw) / 10 ** t.decimals,
          amountRaw: v.raw,
          balanceSource: "reduced" as const,
        };
      });
  const view: SparkPositionView = {
    wallet,
    status: "open",
    supplies: reserves("supply"),
    borrows: reserves("debt"),
    peakSupplies: [],
    peakBorrows: [],
    liquidationCount: 0,
    txCount: 0,
    lastActivityAt: 0,
    priceByAddress: prices,
  };
  return { events, series, prices, view };
}

test("SparkLend: the ledger's in and out meet the route's buckets at the live stop, transfers and the treasury fee included", () => {
  const LEDGER_BUCKET: Record<string, string> = {
    "Sent to another account": "sent",
    "Received by transfer": "received",
  };
  for (const [wallet, file] of [
    // 33 liquidations, each with the Spark treasury's fee.
    ["0x685ffd82e8395229974a4dc4e9034fe6108f128c", "lifetime-flows-series-spark-685f.json"],
    // spToken transfers in and out.
    ["0xe4317db5791ea5de9209b9839898ef65522b239e", "lifetime-flows-series-spark-e431.json"],
  ]) {
    const { events, series, prices, view } = sparkCase(wallet, file);
    // The ledger from the page's rows, and from the route's whole-history sums
    // (what a folder-served or windowed page reads).
    for (const from of ["rows", "route"] as const) {
      const ledger =
        from === "rows"
          ? computeSparkEconomics(view, events)
          : computeSparkEconomics(view, undefined, lifetimeFromSeries(series));
      assert.ok(ledger.valued, `${wallet.slice(0, 10)}: the ledger is valued`);
      const route = sparkFlowSeriesTimeline(series, ledger, prices);
      assert.ok(route);
      const m = buildFlowModel(route) as FlowModel;
      const s = stateAt(m, m.liveStop);
      const name = `${wallet.slice(0, 10)} (${from})`;
      const cl = ledger.collateral;
      const dl = ledger.debt;
      // The totals.
      assert.ok(near(seg(s.collateral, "deposited"), cl.lifetimeInflow), `${name}: deposited`);
      assert.ok(near(seg(s.collateral, "received"), usdSum(cl.received)), `${name}: received`);
      assert.ok(near(s.collateral.out, usdSum(cl.exited) + usdSum(cl.liquidated)), `${name}: collateral out`);
      assert.ok(near(seg(s.debt, "borrowed"), dl.lifetimeInflow), `${name}: borrowed`);
      assert.ok(near(s.debt.out, usdSum(dl.exited) + usdSum(dl.liquidated)), `${name}: debt out`);
      assert.ok(near(s.collateral.now, usdSum(cl.current)), `${name}: held`);
      assert.ok(near(s.debt.now, usdSum(dl.current) + (dl.interest?.usd ?? 0)), `${name}: owed`);
      // Each ledger row against the bucket's part for its asset.
      const parts = assetsAt(m, m.liveStop).flows;
      const rows: [string, TowerLine[]][] = [
        ["collateral", cl.exited],
        ["received", cl.received ?? []],
        ["liquidatedCollateral", cl.liquidated],
        ["repaid", dl.exited],
        ["liquidatedDebt", dl.liquidated],
      ];
      let checked = 0;
      for (const [kind, lines] of rows)
        for (const l of lines) {
          const bucket =
            kind === "collateral"
              ? (LEDGER_BUCKET[l.flowLabel ?? ""] ?? "withdrawn")
              : (LEDGER_BUCKET[l.flowLabel ?? ""] ?? kind);
          const part = parts.get(bucket)?.find((p) => p.symbol === l.symbol);
          assert.ok(part && near(part.usd, l.usd ?? NaN), `${name}: ${bucket} ${l.symbol} ${part?.usd} vs ${l.usd}`);
          checked++;
        }
      assert.ok(checked > 0);
      if (wallet.startsWith("0x685ffd82"))
        // The treasury's fee rides the liquidated collateral, as the card states it.
        assert.ok((ledger.liquidationSplit ?? []).some((x) => x.symbol === "WETH" && x.fee > 0));
      else
        assert.ok((cl.received ?? []).length > 0 && cl.exited.some((l) => l.flowLabel === "Sent to another account"));
    }
  }
});

// ── The Aave V3 family ledger: folder-served pages and the debt's lines ─────

/** Each ledger row's bucket on the bars. */
const LEDGER_ROW_BUCKETS: Record<string, string[]> = {
  withdrawn: ["withdrawn"],
  "Sold to repay": ["soldToRepay"],
  "Withdrawn and swapped": ["withdrawnSwapped"],
  "Swapped to another asset": ["swappedOut"],
  "Sent to another account": ["sent"],
  "Received by transfer": ["received"],
  "Swapped in": ["swappedIn"],
  repaid: ["repaid", "repaidWithCollateral"],
  "Repaid by a debt swap": ["repaidBySwap"],
  liquidatedCollateral: ["liquidatedCollateral"],
  liquidatedDebt: ["liquidatedDebt"],
  "Written off": ["writtenOff"],
  borrowed: ["borrowed"],
};

/** The ledger's rows against the bars' buckets at the live stop, asset by
 *  asset; the number of rows that differ. */
function ledgerAgainstBars(
  ledger: ReturnType<typeof computeAaveV3Economics>,
  series: FlowSeries,
  prices: Record<string, number>,
) {
  const route = aaveV3FlowSeriesTimeline(series, ledger, prices);
  assert.ok(route, "the bars draw");
  const m = buildFlowModel(route) as FlowModel;
  const parts = assetsAt(m, m.liveStop).flows;
  const rows: [string, TowerLine[]][] = [
    ["withdrawn", ledger.collateral.exited],
    ["received", ledger.collateral.received ?? []],
    ["liquidatedCollateral", ledger.collateral.liquidated],
    ["repaid", ledger.debt.exited],
    ["liquidatedDebt", ledger.debt.liquidated],
    ["borrowed", ledger.debt.inflowLines ?? []],
  ];
  const off: string[] = [];
  let checked = 0;
  for (const [kind, lines] of rows)
    for (const l of lines) {
      const buckets = LEDGER_ROW_BUCKETS[l.flowLabel ?? kind] ?? LEDGER_ROW_BUCKETS[kind];
      const usd = buckets.reduce((a, b) => a + (parts.get(b)?.find((p) => p.symbol === l.symbol)?.usd ?? 0), 0);
      if (!near(usd, l.usd ?? NaN)) off.push(`${buckets[0]} ${l.symbol}: bars ${usd}, ledger ${l.usd}`);
      checked++;
    }
  const s = stateAt(m, m.liveStop);
  if (!near(seg(s.collateral, "deposited"), ledger.collateral.lifetimeInflow)) off.push("deposited");
  if (!near(s.collateral.out, usdSum(ledger.collateral.exited) + usdSum(ledger.collateral.liquidated)))
    off.push("collateral out");
  if (!near(s.debt.out, usdSum(ledger.debt.exited) + usdSum(ledger.debt.liquidated))) off.push("debt out");
  return { off, checked };
}

test("Aave V3, served as folders: the ledger reads the route's totals and meets the bars row by row (0xeca2…42dc)", () => {
  const f = readJson<{
    view: AaveV3PositionView;
    laneInterest: AaveLaneInterest[];
    events: BaseActivityEvent[];
    folders: ServedFolder[];
    series: FlowSeries;
  }>("lifetime-flows-aave-v3-folders-eca2.json");
  assert.ok(f.folders.length > 0, "the page is served as folders");
  const prices: Record<string, number> = { ...f.view.priceByAddress };
  for (const [asset, p] of Object.entries(f.series.prices)) prices[asset] ??= p.obs[p.obs.length - 1][1];
  const view = { ...f.view, priceByAddress: prices };
  // The page's rows and the folders' sums: a folder's transfers are not in
  // them, so this ledger's withdrawals fall short of the bars.
  const fromPage = computeAaveV3Economics(
    view,
    f.events,
    undefined,
    aaveV3LifetimeWithOpening(f.events, null, f.folders),
    f.laneInterest,
  );
  assert.ok(ledgerAgainstBars(fromPage, f.series, prices).off.length > 0, "the page's own rows differ from the bars");
  // The route's whole-history totals: every row meets its bucket.
  const lifetime = lifetimeFromSeries(f.series);
  assert.ok(lifetime, "the route states its totals");
  const ledger = computeAaveV3Economics(view, f.events, undefined, lifetime, f.laneInterest);
  assert.ok(ledger.valued, "valued");
  const { off, checked } = ledgerAgainstBars(ledger, f.series, prices);
  assert.deepEqual(off, []);
  assert.ok(checked >= 5, `${checked} rows checked`);
  // With the flows whole, the collateral column states its price change.
  assert.ok(ledger.collateral.priceChange != null, "a collateral price change");
});

/** The debt column adds up to what is owed: in + interest − out ± price change. */
function debtAddsUp(ledger: ReturnType<typeof computeAaveV3Economics>): void {
  const d = ledger.debt;
  const owed = usdSum(d.current) + (d.interest?.usd ?? 0);
  const column =
    d.lifetimeInflow +
    usdSum(d.earned) +
    (d.interest?.usd ?? 0) -
    usdSum(d.exited) -
    usdSum(d.liquidated) +
    (d.priceChange?.usd ?? 0);
  assert.ok(near(column, usdSum(d.current) + (d.interest?.usd ?? 0), 0.01), `column ${column}, owed ${owed}`);
  assert.ok(near(usdSum(d.inflowLines), d.lifetimeInflow), "the borrowed rows sum to the all-time figure");
}

test("SparkLend 0x685f…128c: repayments over borrowing leave no negative principal, and the debt lines add to what is owed", () => {
  const c = sparkCase("0x685ffd82e8395229974a4dc4e9034fe6108f128c", "lifetime-flows-series-spark-685f.json");
  const { events, series, prices } = c;
  // The rows' last debt_after reads zero; what it owes now is the interest
  // since (the listing's DAI debt, read 2026-09-29).
  const dai = {
    symbol: "DAI",
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    decimals: 18,
    amount: 1.1128204165647717,
    amountRaw: "1112820416564771664",
    balanceSource: "reduced" as const,
  };
  const view = { ...c.view, borrows: [dai] };
  const lifetime = lifetimeFromSeries(series)!;
  const f = lifetime.find((r) => r.symbol === "DAI")!;
  const net = f.borrowed - f.repaid - f.liquidatedDebt - f.writtenOff - (f.repaidBySwap ?? 0);
  assert.ok(net < 0, `DAI: the events took out ${-net} more than they borrowed`);
  // Lanes as the api states them, one per debt reserve the position moved:
  // the net its events moved, and the interest (balance less net).
  const lanes: AaveLaneInterest[] = lifetime
    .filter((r) => r.borrowed > 0 && r.address)
    .map((r) => {
      const decimals = r.symbol === "USDC" || r.symbol === "USDT" ? 6 : 18;
      const netRaw = BigInt(
        Math.round((r.borrowed - r.repaid - r.liquidatedDebt - r.writtenOff - (r.repaidBySwap ?? 0)) * 10 ** decimals),
      );
      const balance = r.symbol === "DAI" ? BigInt(dai.amountRaw) : BigInt(0);
      return {
        market: "spark",
        reserve: r.address!.toLowerCase(),
        axis: "debt" as const,
        balance: balance.toString(),
        net: netRaw.toString(),
        interest: (balance - netRaw).toString(),
        block: 0,
      };
    });
  for (const [name, ledger] of [
    ["rows", computeSparkEconomics(view, events)],
    ["route", computeSparkEconomics(view, undefined, lifetime)],
    ["route, lanes", computeSparkEconomics(view, events, lifetime, lanes)],
  ] as const) {
    const d = ledger.debt;
    assert.ok(ledger.valued, name);
    assert.ok(
      d.current.every((l) => l.amount >= 0),
      `${name}: no negative principal`,
    );
    // The whole DAI balance is its row; the interest is one row of its own.
    assert.ok(near(d.current[0].amount, dai.amount, 1e-9), `${name}: DAI owed`);
    assert.equal(d.interest ?? null, null, name);
    const interest = (d.earned ?? []).filter((l) => l.symbol === "DAI");
    assert.equal(interest.length, 1, `${name}: one DAI interest row`);
    assert.ok(near(interest[0].amount, dai.amount - net, 1e-6), `${name}: interest ${interest[0].amount}`);
    // With every lane's interest the token sums reconcile, the column states
    // its price change and adds up to what is owed.
    if (name !== "route, lanes") continue;
    assert.ok(d.priceChange != null, "a price change");
    debtAddsUp(ledger);
    // The bars' owed is the ledger's, and the balancing item is its interest
    // and price change added.
    const m = buildFlowModel(sparkFlowSeriesTimeline(series, ledger, prices)!) as FlowModel;
    const s = stateAt(m, m.liveStop);
    assert.ok(near(s.debt.now, usdSum(d.current)), `${name}: owed`);
    assert.ok(
      near(seg(s.debt, "debt-market"), usdSum(d.earned) + (d.priceChange?.usd ?? NaN), 0.5),
      `${name}: interest and price change`,
    );
  }
});

test("where the debt's principal stays above zero it keeps the principal and interest split", () => {
  // 0xfb93…2a71 owes USDT and USDC, each under its lane: net plus interest.
  const d = tower.debt;
  assert.ok(d.current.length > 0 && d.current.every((l) => l.amount > 0), "principal above zero");
  assert.ok((d.interest?.amount ?? 0) > 0, "interest on top");
  debtAddsUp(tower);
});

test("Aave V4: the route's day rows reproduce the event-level answer at every event day, one spoke position", () => {
  const legs = readJson<{ cases: { wallet: string; spoke: string; events: BaseActivityEvent[] }[] }>(
    "aave-v4-flow-legs.json",
  );
  const live = { collateralUsd: 0, debtUsd: 0 };
  for (const [wallet, file] of [
    ["0xb0dd3df3f4f9b4767e5cc68de3a41c91624bff76", "lifetime-flows-series-v4-b0dd.json"],
    ["0x0fc9b8b7a341da6b41638c2f58cd1509bfa0afd3", "lifetime-flows-series-v4-0fc9.json"],
  ]) {
    const c = legs.cases.find((x) => x.wallet === wallet)!;
    const reference = aaveV4FlowTimeline(c.events, wallet, c.spoke, live, undefined);
    assert.ok(reference);
    const route = aaveV4FlowSeriesTimeline(readJson<FlowSeries>(file), live, undefined);
    assert.ok(route);
    const a = buildFlowModel(reference) as FlowModel;
    const b = buildFlowModel({ ...sameFooting(route), live }) as FlowModel;
    assertDaysMatch(wallet.slice(0, 10), a, b);
    assert.ok(
      b.ticks.some((t) => t.tick === "liquidation"),
      "liquidation days tick red",
    );
  }
});

test("the counter counts the card's transactions", () => {
  const m = buildFlowModel(
    aaveV4FlowSeriesTimeline(readJson<FlowSeries>("lifetime-flows-series-v4-b0dd.json"), null, undefined)!,
  )!;
  const s = stateAt(m, m.liveStop);
  assert.equal(s.count, 33);
  assert.equal(s.txs, 28);
  assert.equal(m.totalTxs, 28);
});

// ── The flows panel and the timeline tied together (lib/shared/flow-focus.ts) ──

test("the event card's sum: the running totals around each event meet the route's day rows, and the printed lines add", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const focus = aaveV3FocusEvents(fixture.events, fixture.view.priceByAddress);
  assert.equal(focus.length, 63);
  let exact = 0;
  for (const ev of focus) {
    const cum = eventCum(route, focus, ev.id);
    assert.ok(cum, `a sum for ${ev.id}`);
    if (cum.exact) exact++;
    // The event's own legs are the move from before to after.
    for (const l of ev.legs) if (l.usd != null) assert.ok(cum.after[l.bucket] - cum.before[l.bucket] >= l.usd - 1e-6);
    // The last event of a day lands on the day row.
    const sameDay = focus.filter((e) => Math.floor(e.ts / 86_400) === Math.floor(ev.ts / 86_400));
    if (sameDay[sameDay.length - 1].id === ev.id) {
      const row = route.rows.find((r) => r.day === cum.stop)!;
      for (const b of route.buckets) assert.ok(near(cum.after[b.key], row.cum[b.key] ?? 0, 1), `${b.key} at ${ev.id}`);
    }
    // Held at the event: any figure; the printed lines add to the printed total.
    for (const side of ["collateral", "debt"] as const) {
      const held: number = stateAt(route, cum.stop)[side].now;
      const sum = eventSideSum(route, side, cum, held);
      assert.equal(
        sum.lines.reduce((a, l) => a + l.dollars, 0),
        sum.total.dollars,
        `${side} at ${ev.id}`,
      );
      assert.equal(sum.total.amount, wholeUsd(held));
      for (const l of sum.lines) assert.equal(l.hl, cum.buckets.has(l.key));
    }
  }
  assert.equal(exact, 63, "the page holds the whole history, so every event's totals are its own");
  // The 29 Sep 2026 Borrow of 200 USDC: Borrowed moves by $200 and is the highlighted line.
  const borrow = fixture.events.find(
    (e) =>
      e.timestamp >= Date.UTC(2026, 8, 29) / 1000 &&
      (e.context?.data as { eventType?: string } | undefined)?.eventType === "borrow",
  );
  if (borrow) {
    const cum = eventCum(route, focus, borrow.id)!;
    assert.ok(near(cum.after.borrowed - cum.before.borrowed, 200, 1));
  }
});

test("the event card's sum where the page lacks some of a day's events: the day's close, said so", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const all = aaveV3FocusEvents(fixture.events, fixture.view.priceByAddress);
  // A day with two or more events, one of them left off the page.
  const byDay = new Map<number, typeof all>();
  for (const e of all) byDay.set(Math.floor(e.ts / 86_400), [...(byDay.get(Math.floor(e.ts / 86_400)) ?? []), e]);
  const busyDay = [...byDay.values()].find((xs) => xs.length >= 2 && xs.some((x) => x.legs.length > 0));
  assert.ok(busyDay, "the fixture has a day with two events");
  const dropped = busyDay[busyDay.length - 1];
  const page = all.filter((e) => e.id !== dropped.id);
  const cum = eventCum(route, page, busyDay[0].id)!;
  if (dropped.legs.some((l) => (l.usd ?? 0) > 1)) {
    assert.equal(cum.exact, false);
    const row = route.rows.find((r) => r.day === cum.stop)!;
    for (const b of route.buckets) assert.ok(near(cum.after[b.key], row.cum[b.key] ?? 0, 1e-6));
  }
});

test("the fill rule: no two lines of a side share a fill", () => {
  // A line's fill (lifetime-flows-tip.tsx fillStyle): held solid; an outflow
  // its hatch in its tone; an inflow the faded hue with its texture, or none.
  const fillOf = (b: (typeof AAVE_V3_FLOW_BUCKETS)[number]) =>
    b.dir === "in"
      ? `in:${b.hatch ?? "plain"}`
      : `out:${b.tone ?? "exit"}:${b.hatch ?? (b.tone && b.tone !== "exit" ? "forward" : "reverse")}`;
  for (const side of ["collateral", "debt"] as const) {
    const fills = ["held", ...AAVE_V3_FLOW_BUCKETS.filter((b) => b.side === side).map(fillOf)];
    // The window's opening line ("Held on …") takes the rings.
    if (side === "collateral") fills.push("in:rings");
    assert.equal(new Set(fills).size, fills.length, `${side}: ${fills.join(", ")}`);
  }
  const used = AAVE_V3_FLOW_BUCKETS.find((b) => b.key === "usedToRepay");
  const sold = AAVE_V3_FLOW_BUCKETS.find((b) => b.key === "soldToRepay");
  assert.notEqual(used?.hatch, sold?.hatch, "Used to repay has its own hatch");
});

test("the state card: a day between events states the chart's figures, each asset as its last event left it", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const focus = aaveV3FocusEvents(fixture.events, fixture.view.priceByAddress);
  const startDay = route.start / DAY_MS;
  let checked = 0;
  for (let stop = 1; stop < route.liveStop; stop++) {
    const endTs = (startDay + stop + 1) * 86_400 - 1;
    const m: FlowMoment | null = flowMoment(route, focus, endTs);
    if (route.eventDays.includes(stop)) {
      assert.equal(m, null, `a day with events keeps its last event as the anchor (stop ${stop})`);
      continue;
    }
    assert.ok(m, `a moment at stop ${stop}`);
    checked++;
    const chart = stateAt(route, stop);
    const lastStop = m.lastDay - startDay;
    for (const side of ["collateral", "debt"] as const) {
      const s: MomentSide = m.sides[side];
      // Every held reserve recorded a price that day: USD, and a clean sum.
      assert.ok(s.priced, `${side} priced at stop ${stop}`);
      const usd = s.assets.reduce((t, a) => t + (a.usd ?? 0), 0);
      assert.ok(near(usd, chart[side].now, 1e-6), `${side} at stop ${stop}: ${usd} vs the chart's ${chart[side].now}`);
      assert.ok(near(s.held, chart[side].now, 1e-6));
      // The tokens are the last event's balances.
      const last = new Map(
        route.heldAt[lastStop].filter((h) => h.side === side && (h.amount ?? 0) > 0).map((h) => [h.symbol, h.amount]),
      );
      assert.equal(s.assets.length, last.size);
      for (const a of s.assets) assert.equal(a.tokens, last.get(a.symbol), `${side} ${a.symbol} at stop ${stop}`);
      // The sum to that day adds up to the held figure.
      let ri = -1;
      for (let i = 0; i < route.rows.length && route.rows[i].day <= stop; i++) ri = i;
      const rows = sideSumRows(sideStateFor(route, side, route.rows[ri].cum, s.held));
      assert.equal(
        rows.lines.reduce((a, l) => a + l.dollars, 0),
        rows.total.dollars,
      );
    }
  }
  assert.ok(checked > 100, `days between events checked: ${checked}`);
  // Today, and a cut on an event day, have no card.
  assert.equal(flowMoment(route, focus, (startDay + route.liveStop) * 86_400 + 10), null);
});

test("Combined: a cut restored from the address bar puts the cursor on a stop of its own, which the steps pass over", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const full = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const line = binSeries(binInputFromWire(series), "month")!;
  const plain = combinedStops(full, line, 0);
  // A day that is neither a month's end nor a day with events.
  let day = 1;
  while (plain.some((s) => s.stop === day)) day++;
  const restored = combinedStops(full, line, 0, day);
  assert.equal(restored.length, plain.length + 1);
  const i = stopForDay(restored, day);
  assert.ok(i != null);
  assert.equal(restored[i].point, null);
  assert.equal(restored[i].event, false);
  // The back and forward steps go by days with events, so they pass over it.
  assert.notEqual(eventStep(restored, i - 1, 1), i);
  // A day that already has a stop adds none.
  assert.equal(combinedStops(full, line, 0, full.eventDays[3]).length, plain.length);
});

// The reserves' indexes (lifetime-flows-series-*-indexed.json: the route's
// answers with `indexes`, read through victoria's read-only session on
// 1 Oct 2026). A balance on a day after the event that recorded it is
// recorded × the index at the day's close ÷ the index at that event.
const INDEXED: [string, string, "v3" | "v4"][] = [
  ["Aave V3 0xfb93…2a71", "lifetime-flows-series-fb93-indexed.json", "v3"],
  ["Aave V4 Main 0x0fc9…afd3", "lifetime-flows-series-v4-0fc9-indexed.json", "v4"],
  ["Aave V4 Bluechip 0xb0dd…ff76", "lifetime-flows-series-v4-b0dd-indexed.json", "v4"],
];
const indexedModel = (file: string, family: "v3" | "v4") => {
  const series = readJson<FlowSeries>(file);
  const t =
    family === "v3"
      ? aaveV3FlowSeriesTimeline(series, null, undefined)
      : aaveV4FlowSeriesTimeline(series, null, undefined);
  return { series, t: t!, m: buildFlowModel(t!) as FlowModel };
};

test("indexes: on an event day each balance the day recorded is stated as recorded (Aave V3, Aave V4)", () => {
  for (const [name, file, family] of INDEXED) {
    const { series, t, m } = indexedModel(file, family);
    assert.ok(t.indexes, `${name}: the fixture carries indexes`);
    const startDay = m.start / DAY_MS;
    let checked = 0;
    for (const d of t.days) {
      const stop = d.day - startDay;
      for (const b of d.balances) {
        if (!(b.amount > 0)) continue;
        assert.ok(b.index != null && b.index > 0, `${name}: ${b.symbol} on day ${d.day} carries its event's index`);
        const h = m.heldAt[stop].find((x) => x.side === b.side && x.symbol === b.symbol);
        assert.ok(h, `${name}: ${b.symbol} held on day ${d.day}`);
        assert.equal(h.amount, b.amount, `${name}: ${b.side} ${b.symbol} on its event day ${d.day}`);
        assert.equal(h.grown, undefined, `${name}: nothing grown on its own event day`);
        checked++;
      }
    }
    assert.ok(checked >= 10, `${name}: event-day balances checked: ${checked}`);
    assert.ok(series.days.length > 0);
  }
});

test("indexes: between events the card, the bars and the line state recorded × index ÷ index at the event", () => {
  for (const [name, file, family] of INDEXED) {
    const { series, t, m } = indexedModel(file, family);
    const startDay = m.start / DAY_MS;
    const line = binSeries(binInputFromWire(series), "day")!;
    let grownSeen = 0;
    for (let stop = 1; stop < m.liveStop; stop++) {
      const day = startDay + stop;
      for (const h of m.heldAt[stop]) {
        if (!h.grown) continue;
        grownSeen++;
        const g = h.grown;
        assert.ok(g.recordedDay < day && g.indexDay === day, `${name}: ${h.symbol} grown to its own day ${day}`);
        const row =
          t.indexes!.assets[Object.keys(t.indexes!.assets).find((a) => (series.assets[a]?.symbol ?? a) === h.symbol)!];
        const at = row.find((r) => r[0] === day)!;
        assert.equal(g.index, h.side === "collateral" ? at[1] : at[2], `${name}: the day's ${h.side} index`);
        assert.ok(near(h.amount ?? 0, (g.recorded * g.index) / g.anchor, 1e-12 * (h.amount ?? 1)));
        assert.ok((h.amount ?? 0) >= g.recorded, `${name}: interest only adds (${h.symbol} on ${day})`);
      }
      // The line's day point is the bars' figure that day.
      const p = line.points.find((x) => x[0] === day);
      const v = m.valued[stop];
      if (p && p[2] != null)
        assert.ok(near(p[2], v.collateral, 1e-6 * Math.max(1, v.collateral)), `${name}: collateral line at ${day}`);
      if (p && p[3] != null) assert.ok(near(p[3], v.debt, 1e-6 * Math.max(1, v.debt)), `${name}: debt line at ${day}`);
      // The state card states the model's tokens and their interest.
      if (m.eventDays.includes(stop)) continue;
      const mo: FlowMoment | null = flowMoment(m, [], (day + 1) * 86_400 - 1);
      assert.ok(mo, `${name}: a moment at ${day}`);
      for (const side of ["collateral", "debt"] as const)
        for (const a of mo.sides[side].assets) {
          const h: FlowAssetHeld = m.heldAt[stop].find((x) => x.side === side && x.symbol === a.symbol)!;
          assert.equal(a.tokens, h.amount);
          if (h.grown) {
            assert.equal(a.recorded, h.grown.recorded);
            assert.ok(near(a.interest ?? -1, (h.amount ?? 0) - h.grown.recorded, 1e-15 * (h.amount ?? 1)));
            if (a.price != null) assert.ok(near(a.interestUsd ?? -1, (a.interest ?? 0) * a.price, 1e-9));
          } else assert.equal(a.interest, null);
        }
    }
    assert.ok(grownSeen > 20, `${name}: balances grown between events: ${grownSeen}`);
  }
});

test("indexes: Aave V3 0xfb93…2a71 grown to the close of 10 Dec '23 is the chain's balance", () => {
  // aWBTC and variableDebtUSDT balanceOf(0xfb93…2a71) at block 18,752,088, the
  // last Aave V3 event block of 10 Dec 2023 (109 s before midnight), read by
  // eth_call on 1 Oct 2026. The recorded balances are 1.91023454 WBTC
  // (31 Aug '23) and 25,132.096979 USDT (27 Sep '23).
  const { m } = indexedModel("lifetime-flows-series-fb93-indexed.json", "v3");
  const stop = 19_700 - m.start / DAY_MS;
  const at = (symbol: string) => m.heldAt[stop].find((h) => h.symbol === symbol)!.amount ?? 0;
  assert.ok(Math.abs(at("WBTC") / 1.91116516 - 1) < 1e-6, `WBTC ${at("WBTC")}`);
  assert.ok(Math.abs(at("USDT") / 25471.68126 - 1) < 1e-6, `USDT ${at("USDT")}`);
});

test("indexes: a route without them grows nothing and says so on the card", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const t = aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!;
  assert.equal(t.indexes, undefined);
  assert.equal(t.words?.moment?.notes?.length, 1);
  const m = buildFlowModel(t) as FlowModel;
  assert.ok(m.heldAt.every((hs) => hs.every((h) => h.grown == null)));
});
