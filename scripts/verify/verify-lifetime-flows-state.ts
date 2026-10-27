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
// and a bin with no price recorded for a held asset a gap. A balance step
// (Core's GHO discount settlement, lifetime-flows-series-gho-2079.json, read
// 2026-10-01) is read from its day and is no event day. The price view
// (lib/shared/flows-price.ts, ui-jobs 328): "Value · Price" is no input to the
// stops, so the cursor keeps its stop and the Value view its line; both strips
// take one time axis; the price series keep the route's blocks; carried days
// draw dotted, nothing before the first point, the step mark by grain. A
// Liquity V2 Trove's liquidation level (`liquityLiqLevel`, ui-jobs 328 step 3)
// is the card's debt × MCR ÷ collateral after each event, moved by the
// interest between events, ended at a liquidation on the level before it, and
// today's at the live read; each row's price is a mark at its block.
//
//   npx tsx --test scripts/verify/verify-lifetime-flows-state.ts
import { createFlowFocusStore, rewindEvents, rewindRows, timelineCut } from "@/lib/shared/flow-focus";
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
  partialAt,
  unsureAt,
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
import {
  flowPriceSeries,
  formatPrice,
  levelAt,
  pricePieces,
  priceReadout,
  redemptionsOn,
  runwayPct,
  runwayShare,
} from "@/lib/shared/flows-price";
import { eventPriceSeries } from "@/lib/shared/price-series";
import { binUnitFor, flowBins, groupOperations, isBusy, throughput } from "@/lib/shared/flows-busy";
import { AAVE_V3_BASE_FLOW_BUCKETS } from "@/lib/aave-v3-base/flows";
import { compoundFlowBuckets } from "@/lib/compound/flows";
import { ctokenFlowBuckets } from "@/lib/shared/ctoken-flows";
import { dolomiteFlowBuckets } from "@/lib/dolomite/flows";
import { fluidFlowBuckets } from "@/lib/fluid/flows";
import { frankencoinFlowBuckets } from "@/lib/frankencoin/flows";
import { fxFlowBuckets } from "@/lib/fx/flows";
import { llamalendFlowBuckets } from "@/lib/llamalend/flows";
import { makerFlowBuckets } from "@/lib/makerdao/flows";
import { mapleFlowBuckets } from "@/lib/maple/flows";
import { morphoFlowBuckets } from "@/lib/morpho/flows";
import { polarisFlowBuckets } from "@/lib/polaris/flows";
import { pwnFlowBuckets } from "@/lib/pwn/flows";
import {
  liquityFlowBuckets,
  liquityFlowTimeline,
  liquityLiqLevel,
  liquityV2FlowEvents,
  type LiquityFlowEvent,
} from "@/lib/shared/liquity-flows";
import { troveLiquidationPrice } from "@/lib/utils/liquidation-utils";
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
  axisEndDay,
  axisSpanDays,
  closeStop,
  combinedAt,
  combinedStops,
  eventStep,
  lifeAxis,
  nearestStop,
  stopForDay,
} from "@/lib/shared/flows-combined";
import { apportionDollars, sideSumRows, wholeUsd } from "@/lib/shared/flows-sum";
import { healthReadPicks, healthView } from "@/lib/shared/flows-health";
import {
  assetTokenSum,
  eventAssetSum,
  eventCum,
  eventSideSum,
  eventSideSumByAsset,
  type AssetBalance,
} from "@/lib/shared/flow-focus";
import { flowMoment, type FlowMoment, type MomentSide } from "@/lib/shared/flow-moment";
import { assetLedgers, dollarLedger, ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";

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
  assert.equal(formatFlowUsd(s.collateral.now), "$123K");
  assert.equal(formatFlowUsd(s.collateral.total), "$206K");
  assert.equal(formatFlowUsd(s.collateral.out), "$83K");
  assert.equal(formatFlowUsd(s.debt.now), "$48K");
  assert.equal(formatFlowUsd(s.debt.total), "$60K");
  assert.equal(formatFlowUsd(s.debt.out), "$12K");
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
  assert.deepEqual(axisFor(0.95).ticks, [0, 0.25, 0.5, 0.75, 1]);
  // A peak of any size: distinct ticks from a bounded loop (ui-jobs 379, a
  // vault holder keeping 1 wei of shares; a peak under 1e-6 ran the loop
  // about 1e8 times, or repeated "0.000001").
  for (const peak of [1e-18, 3.7e-12, 2.5e-9, 8e-7, 1e-6, 4.2e-3, 7, 1e12, 3e21]) {
    const { max, ticks } = axisFor(peak);
    assert.ok(ticks.length >= 2 && ticks.length <= 12, `${peak}: ${ticks.length} ticks`);
    assert.equal(new Set(ticks).size, ticks.length, `${peak}: distinct ticks`);
    const top = ticks[ticks.length - 1];
    const step = ticks[1] - ticks[0];
    assert.ok(top <= max * (1 + 1e-9) && top + step > max * (1 - 1e-9), `${peak}: the last tick under the top`);
  }
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
  assert.equal(formatFlowUsd(5_473), "$5.5K");
  assert.equal(formatFlowUsd(123_024), "$123K");
  assert.equal(formatFlowUsd(-5_000), "−$5.0K");
  assert.equal(formatFlowUsd(1_234_567), "$1.2M");
  assert.equal(formatFlowUsd(9_999.7), "$10K");
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
  // The peak counts what the collateral held between a day's events: two
  // round trips of $3.4k and $3.9k inside one day, $3.85 held at the close
  // (the Yearn holder 0xb634…3b3b), turn over about twice, which is not busy.
  const roundTrips = (high: boolean) => {
    const ev = (i: number, bucket: string, usd: number, amount: number) => ({
      id: `e${i}`,
      ts: 20_000 * 86_400 + 600 * i,
      block: i,
      tick: "collateral" as const,
      legs: [{ bucket, usd, symbol: "A" }],
      balances: [{ asset: "a", symbol: "A", side: "collateral" as const, amount }],
      prices: [{ asset: "a", usd: 1 }],
    });
    const days = daysFromEvents(
      ["deposited", "withdrawn"],
      [
        ev(1, "deposited", 3_400, 3_400),
        ev(2, "withdrawn", 3_400, 0),
        ev(3, "deposited", 3_980, 3_980),
        ev(4, "withdrawn", 3_976.15, 3.85),
      ],
    );
    if (!high) for (const d of days) delete d.collateralHigh;
    return buildFlowModel({
      buckets: [
        { key: "deposited", label: "Deposited", side: "collateral", dir: "in" },
        { key: "withdrawn", label: "Withdrawn", side: "collateral", dir: "out" },
      ],
      days,
      live: { collateralUsd: 3.85, debtUsd: 0 },
    }) as FlowModel;
  };
  assert.equal(roundTrips(true).collateralHigh[0], 3_980, "the high after the second deposit");
  assert.equal(isBusy(roundTrips(true)), false, "two round trips in a day");
  assert.equal(throughput(roundTrips(true)).turnover, null, "turned over under twice");
  // Without a high from the events, the day's high is at least its inflow
  // over its events: $7,380 over four.
  assert.equal(roundTrips(false).collateralHigh[0], 1_845, "the day's inflow over its events");
  assert.equal(isBusy(roundTrips(false)), false);
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

test("Timeline follows the chart (ui-jobs 305): the list cut moves with each step; off, the button's cut stands", () => {
  const ev = (id: string, timestamp: number) => ({ id, timestamp });
  const events = [ev("e", 500), ev("d", 400), ev("c", 300), ev("b", 200), ev("a", 100)];
  const store = createFlowFocusStore();
  const listed = () => rewindEvents(events, timelineCut(store.get())?.endTs ?? null).map((e) => e.id);
  const at = (endTs: number, word: string, live = false) => store.set({ cursor: { endTs, word, live } });
  // Off (today's behaviour): the cursor moves the chart only; the button's
  // cut (`rewind`) is what the list reads, and it stays while the cursor moves.
  at(450, "day 4");
  assert.deepEqual(listed(), ["e", "d", "c", "b", "a"], "off: a step cuts nothing");
  store.set({ rewind: { endTs: 350, word: "day 3" } });
  at(250, "day 2");
  assert.deepEqual(listed(), ["c", "b", "a"], "off: the button's cut stands as the cursor moves");
  assert.equal(timelineCut(store.get())?.word, "day 3", "off: the chip names the button's day");
  // On: each step of the cursor cuts the list there and the chip names its day.
  store.set({ follow: true, rewind: null });
  const steps: [number, string, string[]][] = [
    [150, "day 1", ["a"]],
    [250, "day 2", ["b", "a"]],
    [450, "day 4", ["d", "c", "b", "a"]],
    [350, "day 3", ["c", "b", "a"]],
  ];
  for (const [endTs, word, want] of steps) {
    at(endTs, word);
    assert.deepEqual(listed(), want, `on: the cursor at ${word}`);
    assert.equal(timelineCut(store.get())?.word, word, `on: the chip names ${word}`);
  }
  at(Number.MAX_SAFE_INTEGER, "today", true);
  assert.equal(timelineCut(store.get()), null, "on: the cursor at today leaves the list whole");
  // A cut from the address bar still putting the cursor on its day stands
  // until the cursor reaches it; a panel not mounted leaves the stored cut.
  store.set({ rewind: { endTs: 250, word: "day 2" }, restore: { endTs: 250, n: 1 } });
  assert.deepEqual(listed(), ["b", "a"], "on: a restore in hand reads the stored cut");
  store.set({ restore: null, cursor: null });
  assert.deepEqual(listed(), ["b", "a"], "on: no panel, the stored cut");
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

test("the event card's sum by asset: each asset's lines and its interest add to its balance, in its token", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const route = buildFlowModel(aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!) as FlowModel;
  const focus = aaveV3FocusEvents(fixture.events, fixture.view.priceByAddress);
  let multi = 0;
  let single = 0;
  for (const ev of focus) {
    const cum = eventCum(route, focus, ev.id)!;
    for (const side of ["collateral", "debt"] as const) {
      // Balances standing in for the Pool's read: each asset's net flows plus
      // a little interest, at a price of $2.
      const probe = eventAssetSum(route, focus, side, cum, ev.id, []);
      assert.ok(probe, `${ev.id} ${side}: the page holds every flow`);
      const balances: AssetBalance[] = probe.symbols.map((symbol) => {
        let net = 0;
        for (const l of probe.lines)
          if (l.kind !== "interest") {
            const p = l.parts.find((x) => x.symbol === symbol);
            net += (l.kind === "out" ? -1 : 1) * (p?.amount ?? 0);
          }
        const amount = Math.max(0, net * 1.01);
        return { symbol, amount, before: amount, price: 2 };
      });
      const sum = eventAssetSum(route, focus, side, cum, ev.id, balances)!;
      for (const b of balances) {
        let total = 0;
        for (const l of sum.lines) {
          const p = l.parts.find((x) => x.symbol === b.symbol);
          total += (l.kind === "out" ? -1 : 1) * (p?.amount ?? 0);
        }
        assert.ok(
          Math.abs(total - b.amount) <= 1e-9 * Math.max(1, b.amount),
          `${ev.id} ${b.symbol}: ${total} vs ${b.amount}`,
        );
      }
      const held = balances.reduce((a, b) => a + b.amount * 2, 0);
      const dollars = eventSideSumByAsset(route, sum, cum, held);
      assert.equal(
        dollars.lines.reduce((a, l) => a + l.dollars, 0),
        dollars.total.dollars,
        `${ev.id} ${side}: the dollar lines add`,
      );
      const t = assetTokenSum(sum);
      // The cell's ledgers: each asset's rows add in its token and, priced, in
      // USD; the assets' dollars add to the side's.
      const { assets, usd } = assetLedgers({ model: route, side, ev, sum, held, heldBefore: null });
      for (const l of assets) {
        const adds = ledgerAdds(l);
        assert.ok(adds.tokens && adds.usd, `${ev.id} ${side} ${l.symbol}: the asset's ledger adds`);
        for (const r of l.rows.filter((x) => x.role === "event"))
          assert.ok(r.label.startsWith("This "), `${ev.id}: "${r.label}"`);
      }
      assert.equal(
        assets.reduce((a, l) => a + (l.usd?.dollars ?? 0), 0),
        usd.dollars,
        `${ev.id} ${side}: the assets' dollars add to the side's`,
      );
      assert.ok(
        ledgerAdds(
          dollarLedger({ model: route, side, ev, lines: dollars.lines, dollars: dollars.total.dollars, before: null }),
        ).usd,
        `${ev.id} ${side}: the ledger in dollars adds`,
      );
      if (sum.symbols.length === 1) {
        single++;
        assert.ok(t);
        assert.equal(
          t.lines.reduce((a, l) => a + l.units, 0),
          t.total.units,
          `${ev.id} ${side}: token lines add`,
        );
        const l = tokenLedger({
          model: route,
          side,
          ev,
          sum: t,
          usd: { lines: dollars.lines, dollars: dollars.total.dollars, before: null },
        });
        const adds = ledgerAdds(l);
        assert.ok(adds.tokens && adds.usd, `${ev.id} ${side}: the single asset's ledger adds`);
      } else {
        assert.equal(t, null);
        if (sum.symbols.length > 1) multi++;
      }
    }
  }
  assert.ok(multi > 0 && single > 0, `both kinds of side (${multi} multi, ${single} single)`);
  // A page missing an earlier flow cannot count tokens: the sum stays in dollars.
  const firstFlow = focus.findIndex((e) => e.legs.some((l) => (l.usd ?? 0) > 10));
  const page = focus.filter((_, i) => i !== firstFlow);
  const late = page[page.length - 1];
  const cum = eventCum(route, page, late.id)!;
  const sides = (["collateral", "debt"] as const).map((side) => eventAssetSum(route, page, side, cum, late.id, []));
  assert.ok(
    sides.some((x) => x === null),
    "a missing flow is noticed",
  );
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

test("the fill rule in every family: no two lines of a side share a pattern in one hue", () => {
  // An inflow's texture and an outflow's hatch read alike where the pattern
  // and the hue are one (Aave V3 on Base's Interest earned and Used to repay,
  // both dashed, 2 Oct 2026): the pattern and its hue are the fill here, the
  // inflow's faded ground aside. A tone draws in the tone's hue.
  type B = {
    key: string;
    label: string;
    side: "collateral" | "debt";
    dir: "in" | "out";
    hatch?: string;
    tone?: string;
  };
  const pattern = (b: B) =>
    b.dir === "in"
      ? `${b.hatch ?? "plain"}:side`
      : `${b.hatch ?? (b.tone && b.tone !== "exit" ? "forward" : "reverse")}:${b.tone && b.tone !== "exit" ? b.tone : "side"}`;
  const all = new Proxy(new Set<string>(), { get: (t, k) => (k === "has" ? () => true : Reflect.get(t, k)) });
  const families: Record<string, B[]> = {
    "Aave V3": AAVE_V3_FLOW_BUCKETS,
    "Aave V3 on Base": AAVE_V3_BASE_FLOW_BUCKETS,
    "Compound V3": compoundFlowBuckets({ collateral: true, supply: true, debt: true }, all),
    "Compound V2 family": ctokenFlowBuckets({ brand: "Compound", receipt: "cToken" }),
    Dolomite: dolomiteFlowBuckets(),
    Fluid: fluidFlowBuckets(true),
    Frankencoin: frankencoinFlowBuckets(),
    "f(x)": fxFlowBuckets(all),
    LlamaLend: llamalendFlowBuckets(),
    MakerDAO: makerFlowBuckets("DAI"),
    Maple: mapleFlowBuckets(),
    Morpho: morphoFlowBuckets({ borrower: true, lender: true }),
    Polaris: polarisFlowBuckets(all),
    PWN: pwnFlowBuckets(),
    "Liquity V2": liquityFlowBuckets(false, "v2"),
    "Liquity V1": liquityFlowBuckets(false, "v1"),
  };
  for (const [name, buckets] of Object.entries(families))
    for (const side of ["collateral", "debt"] as const) {
      const lines = buckets.filter((b) => b.side === side);
      // The window's opening line ("Held on …") takes the rings.
      const fills = [...lines.map(pattern), ...(lines.length ? ["rings:side"] : [])];
      const seen = new Map<string, string>();
      lines.forEach((b, i) => {
        const was = seen.get(fills[i]);
        assert.ok(!was, `${name}, ${side}: ${was} and ${b.label} share ${fills[i]}`);
        seen.set(fills[i], b.label);
      });
      assert.ok(!seen.has("rings:side"), `${name}, ${side}: a line takes the opening's rings`);
    }
  // Interest is dashed wherever a family draws it as a line.
  for (const [name, buckets] of Object.entries(families))
    for (const b of buckets)
      if (/^Interest( earned| accrued)?$/.test(b.label))
        assert.equal(b.hatch, "dashes", `${name}: ${b.label} is dashed`);
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

test("a balance step (Core's GHO discount settlement) is read from its day, and is no event day", () => {
  // 0x2079…d6ce, read on victoria 2026-10-01: borrows on 16 Jun and 16 Jul '25,
  // the settlement on 3 Jul between them. The chain's figures are the stored
  // scaledBalanceOf × the borrow index at each close.
  const { series, m } = indexedModel("lifetime-flows-series-gho-2079.json", "v3");
  const startDay = m.start / DAY_MS;
  const row = series.days.find((d) => d[0] === 20_272)!;
  const before = series.days[series.days.indexOf(row) - 1];
  assert.equal(row[1], before[1], "the step's row adds no event");
  assert.ok(!m.eventDays.includes(20_272 - startDay), "the step is not an event day");
  assert.ok(!m.ticks.some((t) => t.day === 20_272 - startDay), "the step draws no tick");
  assert.equal(m.ticks.length, series.days.length - 1);
  const gho = (day: number) =>
    m.heldAt[day - startDay].find((h) => h.symbol === "GHO" && h.side === "debt")!.amount ?? 0;
  assert.ok(Math.abs(gho(20_279) / 2_311_682.895 - 1) < 1e-9, `10 Jul '25: ${gho(20_279)}`);
  assert.ok(Math.abs(gho(20_301) / 3_321_406.778 - 1) < 1e-9, `1 Aug '25: ${gho(20_301)}`);
});

test("indexes: a route without them grows nothing and says so on the card", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const t = aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!;
  assert.equal(t.indexes, undefined);
  assert.equal(t.words?.moment?.notes?.length, 1);
  const m = buildFlowModel(t) as FlowModel;
  assert.ok(m.heldAt.every((hs) => hs.every((h) => h.grown == null)));
});

test("incomplete stretches: a figure without its price or read is dashed and named, the figures unchanged", () => {
  const D0 = 20_000;
  const ts = (d: number) => (D0 + d) * 86_400 + 3_600;
  const buckets = [
    { key: "in", label: "Deposited", side: "collateral" as const, dir: "in" as const },
    { key: "out", label: "Withdrawn", side: "collateral" as const, dir: "out" as const },
    { key: "b", label: "Borrowed", side: "debt" as const, dir: "in" as const },
  ];
  const ev = (d: number, legs: { bucket: string; usd: number }[], coll: number, debt: number, extra = {}) => ({
    id: `e${d}`,
    ts: ts(d),
    block: d,
    tick: "collateral" as const,
    legs,
    balances: [
      { asset: "C", symbol: "WETH", side: "collateral" as const, amount: coll },
      { asset: "D", symbol: "USDC", side: "debt" as const, amount: debt },
    ],
    prices: [
      { asset: "C", usd: 1000 },
      { asset: "D", usd: 1 },
    ],
    ...extra,
  });
  const why = {
    legs: "WETH priced at the day's close: the price at this block is not stored yet.",
    unread: "Balances at this row not read.",
  };
  const events = [
    ev(
      0,
      [
        { bucket: "in", usd: 2000 },
        { bucket: "b", usd: 500 },
      ],
      2,
      500,
    ),
    ev(3, [{ bucket: "in", usd: 1000 }], 3, 500, { unsure: [{ side: "collateral", why: why.legs }] }),
    ev(6, [{ bucket: "out", usd: 1000 }], 2, 500, { unsure: [{ side: "debt", why: why.unread, untilNext: true }] }),
    ev(9, [{ bucket: "in", usd: 1000 }], 3, 500),
  ];
  const base: FlowTimeline = {
    buckets,
    days: daysFromEvents(
      buckets.map((b) => b.key),
      events,
    ),
    live: { collateralUsd: 3000, debtUsd: 500 },
    dailyPrices: { C: [[D0, 1000]], D: [[D0, 1]] },
    seriesCarry: true,
    today: D0 + 12,
  };
  const plain = buildFlowModel(base)!;
  const m = buildFlowModel({
    ...base,
    carriedWhy: { C: "no daily price is stored, so a day between events keeps the last event's price." },
  })!;
  // The figures do not move.
  assert.deepEqual(m.valued, plain.valued);
  for (let st = 0; st <= m.liveStop; st++) assert.deepEqual(stateAt(m, st), stateAt(plain, st));
  // Without reasons a model marks nothing (every other family's panel as before).
  const bare = buildFlowModel({ ...base, days: base.days.map(({ unsure: _u, ...d }) => d) })!;
  assert.equal(bare.unsure.size, 0);
  assert.equal(bare.unsureFlows.length, 0);
  assert.deepEqual(partialAt(bare, 5, "collateral"), []);
  // A leg priced off its block marks the bars from its day, not the day's held figure.
  assert.deepEqual(unsureAt(m, 2, "collateral").flows, []);
  assert.deepEqual(unsureAt(m, 3, "collateral"), { held: [], flows: [why.legs] });
  assert.deepEqual(partialAt(m, m.liveStop, "collateral"), [why.legs]);
  // An unread balance stands until the next day with events.
  for (const st of [6, 7, 8]) assert.deepEqual(unsureAt(m, st, "debt").held, [why.unread], `stop ${st}`);
  assert.deepEqual(unsureAt(m, 9, "debt").held, []);
  assert.deepEqual(unsureAt(m, 9, "debt").flows, [why.unread]);
  // A carried price marks each day between events, naming the price's day.
  assert.equal(unsureAt(m, 0, "collateral").held.length, 0, "an event day has its price");
  assert.match(
    unsureAt(m, 1, "collateral").held[0],
    /^WETH is valued at its price of \d+ \w+ '\d\d: no daily price is stored/,
  );
  assert.equal(unsureAt(m, 4, "collateral").held.length, 1);
  // The live stop is the live read's: only the flows' reasons.
  assert.deepEqual(unsureAt(m, m.liveStop, "collateral").held, []);
  // A window keeps each reason, those before it from its opening.
  const w = windowModel(m, 5);
  assert.deepEqual(unsureAt(w, 0, "collateral").flows, [why.legs]);
  assert.deepEqual(unsureAt(w, 1, "debt").held, [why.unread]);
  // One reason over several assets reads as one sentence naming them.
  const two = buildFlowModel({
    ...base,
    days: daysFromEvents(
      buckets.map((b) => b.key),
      [
        ...events,
        ev(10, [{ bucket: "in", usd: 10 }], 3, 500, {
          unsure: [
            { side: "collateral", symbol: "WETH", why: "priced at the day's close." },
            { side: "collateral", symbol: "USDC", why: "priced at the day's close." },
            { side: "collateral", symbol: "WBTC", why: "priced at the day's close." },
          ],
        }),
      ],
    ),
  })!;
  assert.ok(unsureAt(two, 10, "collateral").flows.includes("WETH, USDC and WBTC priced at the day's close."));
});

// The price view (ui-jobs 328, step 2): "Value · Price" swaps the strip and
// nothing the Value view reads; the price line's series and grammar.
test("the price view: the toggle leaves the Value view's stops and axis alone, the Price view keeps the cursor's stop", () => {
  const series = readJson<AaveV3FlowSeries>("lifetime-flows-series-fb93.json");
  const t = aaveV3FlowSeriesTimeline(series, tower, fixture.view.priceByAddress)!;
  const model = buildFlowModel(t) as FlowModel;
  // The stops are a function of the model and the line's series: the view is
  // no input, so the cursor's stop is the same index in both views.
  const stops = combinedStops(model, null, 0, null);
  assert.deepEqual(combinedStops(model, null, 0, null), stops);
  // The whole life's axis (the events row's while the charts are hidden): a
  // day's close later is further right, the axis's last day at the right end.
  const startDay = model.start / DAY_MS;
  const today = startDay + model.liveStop;
  const span = axisSpanDays(startDay, today);
  const x = lifeAxis(800, startDay, span);
  const xs = stops.map((s) => x(startDay + s.stop));
  assert.ok(xs.every((v, i) => i === 0 || v >= xs[i - 1]));
  assert.ok(xs[0] > 0);
  assert.ok(Math.abs(x(startDay + span - 1) - 800) < 1e-9);
  // The series: one per held asset with a daily series, collateral first,
  // each point's block kept from the route.
  const prices = flowPriceSeries(t);
  assert.ok(prices.length > 0);
  assert.equal(prices[0].side, "collateral");
  assert.equal(prices[0].unitLabel, "USD");
  assert.equal(prices[0].source, "AaveOracle, the last price recorded each day");
  const held = new Set(t.days.flatMap((r) => r.balances.map((x) => x.asset)));
  for (const p of prices) {
    assert.ok(held.has(p.key), `${p.asset.symbol} is held`);
    const obs = new Map((t.dailyPrices?.[p.key] ?? []).map((o) => [o[0], o]));
    for (const [day, price, block] of p.points) {
      assert.equal(obs.get(day)?.[1], price);
      assert.equal(obs.get(day)?.[2] ?? null, block);
    }
  }
});

test("the price line: observed days solid, carried days dotted, nothing before the first point, the step mark by grain", () => {
  const s = {
    key: "x",
    asset: { symbol: "WETH", chain: 1 },
    unit: "usd",
    grain: "daily" as const,
    source: "test",
    points: [
      [10, 100, 1000],
      [11, 110, 1010],
      [15, 120, 1050],
      [16, 125, null],
    ] as [number, number, number | null][],
  };
  const p = pricePieces(s, 5, 18);
  assert.deepEqual(p.observed, [10, 11, 15, 16]);
  assert.deepEqual(p.carried, [12, 13, 14, 17, 18]);
  // 10 → 11 solid; 11 → 15 through the carried days dotted; 15 → 16 solid;
  // 16 → 18 dotted.
  assert.deepEqual(p.solid, [
    [
      [10, 100],
      [11, 110],
    ],
    [
      [15, 120],
      [16, 125],
    ],
  ]);
  assert.equal(p.dotted.length, 2);
  assert.deepEqual(p.dotted[0][0], [11, 110]);
  assert.deepEqual(p.dotted[0][p.dotted[0].length - 1], [15, 120]);
  // Nothing drawn before the series' first day.
  assert.ok([...p.solid, ...p.dotted].flat().every(([d]) => d >= 10));
  // The readout: the day's point, or the one before it with its age, old past
  // the panel's gap.
  assert.deepEqual(priceReadout(s, 11, 7)?.point, [11, 110, 1010]);
  const carried = priceReadout(s, 14, 7)!;
  assert.equal(carried.carried, true);
  assert.equal(carried.ageDays, 3);
  assert.equal(carried.point[2], 1010);
  assert.equal(carried.old, false);
  assert.equal(priceReadout(s, 30, 7)?.old, true);
  assert.equal(priceReadout(s, 9, 7), null);
  // An event series: each observation held flat to the next, a riser there.
  const e = eventPriceSeries({
    key: "e",
    asset: { symbol: "WETH", chain: 1 },
    unit: "usd",
    source: "rows",
    obs: [
      { block: 1, ts: 10 * 86_400, price: 100 },
      { block: 2, ts: 14 * 86_400, price: 90 },
    ],
  });
  const ep = pricePieces(e, 0, 20);
  assert.deepEqual(ep.flat, [
    [
      [10, 100],
      [14, 100],
    ],
    [
      [14, 90],
      [20, 90],
    ],
  ]);
  assert.deepEqual(ep.riser, [
    [
      [14, 100],
      [14, 90],
    ],
  ]);
  assert.deepEqual(ep.solid, []);
  assert.deepEqual(ep.dotted, []);
});

test("the price view's series: a face side and the unit's own token draw no line, side units none at all", () => {
  const base: FlowTimeline = {
    buckets: [],
    days: [
      {
        day: 100,
        events: 1,
        tick: "collateral",
        cum: {},
        balances: [
          { asset: "c", symbol: "WETH", side: "collateral", amount: 1 },
          { asset: "d", symbol: "BOLD", side: "debt", amount: 1 },
        ],
        prices: [],
      },
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: {
      c: [
        [100, 2000, 5],
        [101, 2100],
      ],
      d: [[100, 1.0001]],
    },
    words: { moment: { face: ["debt"] } },
  };
  const ps = flowPriceSeries(base);
  assert.deepEqual(
    ps.map((p) => p.asset.symbol),
    ["WETH"],
  );
  assert.deepEqual(ps[0].points, [
    [100, 2000, 5],
    [101, 2100, null],
  ]);
  assert.equal(ps[0].source, "daily price store");
  // A token unit: prices in grains of the unit, its own token skipped.
  const tok = flowPriceSeries({
    ...base,
    unit: { symbol: "USDC", scale: 2 },
    words: {},
    days: [
      {
        ...base.days[0],
        balances: [{ asset: "d", symbol: "USDC", side: "debt", amount: 1 }, base.days[0].balances[0]],
      },
    ],
  });
  assert.deepEqual(
    tok.map((p) => [p.asset.symbol, p.unitLabel, p.points[0][1]]),
    [["WETH", "USDC", 20]],
  );
  assert.deepEqual(
    flowPriceSeries({ ...base, sideUnits: { collateral: { symbol: "A", scale: 0 }, debt: { symbol: "B", scale: 0 } } }),
    [],
  );
});

// ── Liquity V2: the liquidation level and the rows' marks (ui-jobs 328, step 3)

const YEAR = 31_536_000;
const lqEv = (o: Partial<LiquityFlowEvent> & Pick<LiquityFlowEvent, "id" | "ts" | "block">): LiquityFlowEvent => ({
  kind: "owner",
  collAfter: 0,
  debtAfter: 0,
  collOp: null,
  debtOp: null,
  upfrontFee: 0,
  collFromRedist: 0,
  debtFromRedist: 0,
  surplus: 0,
  price: 2000,
  rate: 5,
  fee: 0,
  ...o,
});
const D = 86_400;
const OPEN = lqEv({ id: "a_1", ts: 100 * D + 3600, block: 1000, collAfter: 10, debtAfter: 10_000, debtOp: 10_000 });
const ADD = lqEv({
  id: "b_1",
  ts: 102 * D + 7200,
  block: 1200,
  collAfter: 20,
  debtAfter: 10_010,
  collOp: 10,
  debtOp: 0,
});
const LIQ = lqEv({
  id: "c_1",
  ts: 105 * D + 600,
  block: 1500,
  kind: "liquidation",
  collAfter: 0,
  debtAfter: 0,
  price: 500,
});
const liqWeth = (debt: number, coll: number) =>
  troveLiquidationPrice({ debt, collateral: coll, collateralType: "WETH" })!;

test("the liquidation level: after an event, moved by accrual between events, ended at a liquidation", () => {
  const lv = liquityLiqLevel([OPEN, ADD, LIQ], { collateralType: "WETH", now: 120 * D })!;
  assert.equal(lv.end, "liquidation");
  assert.deepEqual(
    lv.points.map((p) => p[0]),
    [100, 101, 102, 103, 104, 105],
  );
  // After the open: the card's formula on its balances, the debt grown to the day's end.
  const grown = (e: LiquityFlowEvent, at: number) => e.debtAfter * (1 + (e.rate / 100) * ((at - e.ts) / YEAR));
  assert.ok(Math.abs(lv.points[0][1] - liqWeth(grown(OPEN, 101 * D), 10)) < 1e-9);
  assert.equal(lv.points[0][2], 1000);
  // Moved by the accrual on a day without events, on the same row.
  assert.ok(lv.points[1][1] > lv.points[0][1]);
  assert.ok(Math.abs(lv.points[1][1] - liqWeth(grown(OPEN, 102 * D), 10)) < 1e-9);
  assert.equal(lv.points[1][2], 1000);
  // The deposit halves it, on its row's block.
  assert.ok(Math.abs(lv.points[2][1] - liqWeth(grown(ADD, 103 * D), 20)) < 1e-9);
  assert.equal(lv.points[2][2], 1200);
  // The liquidation's day: the level that stood before it, and nothing after.
  assert.ok(Math.abs(lv.points[5][1] - liqWeth(grown(ADD, LIQ.ts), 20)) < 1e-9);
  assert.equal(lv.points[5][2], 1200);
});

test("the liquidation level: an open Trove reaches today at the live read, the card's figure", () => {
  const live = { coll: 20, debt: 10_123.45 };
  const lv = liquityLiqLevel([OPEN, ADD], { collateralType: "WETH", now: 110 * D + 500, live })!;
  assert.equal(lv.end, "today");
  const last = lv.points[lv.points.length - 1];
  assert.equal(last[0], 110);
  assert.equal(last[1], liqWeth(live.debt, live.coll));
  assert.equal(last[2], null);
  // Without the live read, the recorded debt grown to now.
  const bare = liquityLiqLevel([OPEN, ADD], { collateralType: "WETH", now: 110 * D + 500 })!;
  const b = bare.points[bare.points.length - 1];
  assert.ok(Math.abs(b[1] - liqWeth(10_010 * (1 + 0.05 * ((110 * D + 500 - ADD.ts) / YEAR)), 20)) < 1e-9);
  assert.equal(b[2], 1200);
  // A closed Trove ends at its close; a debt redeemed to nothing breaks the line until it borrows again.
  const close = lqEv({ id: "d_1", ts: 104 * D, block: 1400, collAfter: 0, debtAfter: 0, collOp: -20, debtOp: -10_010 });
  assert.equal(liquityLiqLevel([OPEN, ADD, close], { collateralType: "WETH", now: 120 * D })!.end, "close");
  const zero = lqEv({ id: "e_1", ts: 103 * D + 10, block: 1300, kind: "redemption", collAfter: 15, debtAfter: 0 });
  const again = lqEv({ id: "f_1", ts: 106 * D + 10, block: 1600, collAfter: 15, debtAfter: 5000, debtOp: 5000 });
  const gap = liquityLiqLevel([OPEN, ADD, zero, again], { collateralType: "WETH", now: 107 * D })!;
  assert.deepEqual(
    gap.points.map((p) => p[0]),
    [100, 101, 102, 103, 106, 107],
  );
});

test("the price view's Liquity V2 marks: each row at its block, redemptions at their redemption price, the level on the series", () => {
  const red = lqEv({
    id: "r_1",
    ts: 103 * D + 50,
    block: 1300,
    kind: "redemption",
    collAfter: 19,
    debtAfter: 8000,
    collOp: -1,
    debtOp: -2010,
    price: 2010,
    redemptionPrice: 2015,
  });
  const evs = [OPEN, ADD, red];
  const t = liquityFlowTimeline(evs, {
    collSymbol: "WETH",
    debtSymbol: "BOLD",
    live: { price: 2100, coll: 19, debt: 8100 },
    surplusClaimed: false,
    now: 104 * D + 100,
    dailyColl: [
      [101, 2001, 1100],
      [102, 2002, 1250],
      [103, 2003, 1350],
    ],
    priceView: { collateralType: "WETH" },
  })!;
  const [s] = flowPriceSeries(t);
  assert.equal(s.asset.symbol, "WETH");
  assert.deepEqual(
    s.events!.map((e) => [e.day, e.price, e.block, e.tone, e.redemptionPrice ?? null]),
    [
      [100, 2000, 1000, "event", null],
      [102, 2000, 1200, "event", null],
      [103, 2010, 1300, "redemption", 2015],
    ],
  );
  // The days before the branch's series are the rows alone, drawn dotted.
  assert.equal(s.sparseBefore, 101);
  const pieces = pricePieces(s, 100, 104);
  assert.ok(pieces.dotted.some((p) => p[0][0] === 100 && p[p.length - 1][0] === 101));
  assert.ok(pieces.solid.some((p) => p[0][0] === 101));
  // The level's last point is the card's figure at the live read.
  assert.equal(levelAt(s, 104)![1], liqWeth(8100, 19));
  assert.equal(levelAt(s, 105), null);
  assert.equal(s.level!.formula, "debt × 110% ÷ collateral after each event, with interest accruing between");
  // The runway at today, as the card: (price − level) ÷ price.
  const share = runwayShare(2100, levelAt(s, 104)![1]);
  assert.equal(runwayPct(share), String(Math.round(((2100 - liqWeth(8100, 19)) / 2100) * 100)));
  assert.deepEqual(
    redemptionsOn(s, 103).map((e) => e.redemptionPrice),
    [2015],
  );
  // Without the option, no marks: the forks are unchanged.
  const plain = liquityFlowTimeline(evs, {
    collSymbol: "WETH",
    debtSymbol: "BOLD",
    live: null,
    surplusClaimed: false,
    now: 104 * D + 100,
  })!;
  assert.equal(plain.priceMarks, undefined);
});

test("the price view's Liquity V2 marks on a liquidated rETH Trove: blocks match rows, the level ends on the liquidation's day", () => {
  const rows = JSON.parse(readFileSync(join(__dirname, "fixtures", "liquity-flows-v2-liquidated.json"), "utf8"))
    .events as BaseActivityEvent[];
  const evs = liquityV2FlowEvents(rows);
  const t = liquityFlowTimeline(evs, {
    collSymbol: "rETH",
    debtSymbol: "BOLD",
    live: null,
    surplusClaimed: false,
    now: Date.UTC(2026, 9, 13) / 1000,
    priceView: { collateralType: "rETH" },
  })!;
  const [s] = flowPriceSeries(t);
  const byBlock = new Map(evs.map((e) => [e.block, e]));
  for (const m of s.events!) {
    const row = byBlock.get(m.block!);
    assert.ok(row, `a mark at block ${m.block} has a row`);
    assert.equal(m.day, Math.floor(row.ts / D));
    if (m.tone === "redemption") assert.ok(m.redemptionPrice! > 0);
  }
  assert.equal(s.events!.length, evs.filter((e) => e.price != null).length);
  const liq = evs.find((e) => e.kind === "liquidation")!;
  const pts = s.level!.points;
  assert.equal(s.level!.end, "liquidation");
  assert.equal(pts[pts.length - 1][0], Math.floor(liq.ts / D));
});

test("a closed position's chart ends at the close: the axis, the live stop and the price line (ruling 14)", () => {
  const rows = JSON.parse(readFileSync(join(__dirname, "fixtures", "liquity-flows-v2-liquidated.json"), "utf8"))
    .events as BaseActivityEvent[];
  const evs = liquityV2FlowEvents(rows);
  const now = Date.UTC(2026, 9, 13) / 1000;
  const t = liquityFlowTimeline(evs, {
    collSymbol: "rETH",
    debtSymbol: "BOLD",
    live: null,
    surplusClaimed: false,
    now,
    priceView: { collateralType: "rETH" },
  })!;
  const m = buildFlowModel(t) as FlowModel;
  const startDay = m.start / DAY_MS;
  const liqDay = Math.floor(evs.find((e) => e.kind === "liquidation")!.ts / D);
  assert.equal(closeStop(m), m.lastDay);
  assert.equal(startDay + m.lastDay, liqDay);
  const end = axisEndDay(m, Math.floor(now / D));
  assert.equal(end, liqDay);
  const stops = combinedStops(m, null, 0);
  const last = stops[stops.length - 1];
  // One stop on the close day: the live stop, standing for it.
  assert.ok(last.live && last.close === m.lastDay && last.event);
  assert.ok(stops.slice(0, -1).every((x) => x.stop < m.lastDay));
  assert.equal(stopForDay(stops, m.lastDay), stops.length - 1);
  assert.equal(eventStep(stops, stops.length - 2, 1), stops.length - 1);
  // The price line draws no day after the close.
  const [s] = flowPriceSeries(t);
  const p = pricePieces(s, startDay, end);
  assert.equal(Math.max(...p.observed, ...p.carried), liqDay);
  // An open position's axis runs to today.
  assert.equal(axisEndDay(model, 30_000), closeStop(model) == null ? 30_000 : model.start / DAY_MS + model.lastDay);
});

test("Aave V3's health view: the day's prices and the last read's thresholds, the card's figure today, each asset's level (ruling 7)", () => {
  const W = "0xweth";
  const U = "0xusdc";
  const row = (day: number, balances: FlowTimeline["days"][number]["balances"]) => ({
    day,
    events: 1,
    tick: "both" as const,
    cum: {},
    balances,
    prices: [],
  });
  const t: FlowTimeline = {
    buckets: [],
    days: [
      row(100, [
        { side: "collateral", asset: W, symbol: "WETH", amount: 10 },
        { side: "debt", asset: U, symbol: "USDC", amount: 10_000 },
      ]),
      row(103, [{ side: "debt", asset: U, symbol: "USDC", amount: 5_000 }]),
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: {
      [W]: [
        [100, 2000, 1],
        [101, 1800, 2],
        [103, 2100, 3],
      ],
      [U]: [[100, 1, 1]],
    },
    today: 104,
  };
  const reads = [{ day: 100, block: 1000, lt: { [W]: 0.8, [U]: 0 } }];
  const hv = healthView(t, reads, {})!;
  assert.deepEqual(
    hv.health.points.map((p) => [p[0], +p[1].toFixed(4), p[2]]),
    [
      [100, 1.6, 1000],
      [101, 1.44, 1000],
      [102, 1.44, 1000],
      [103, 3.36, 1000],
      [104, 3.36, 1000],
    ],
  );
  assert.ok(hv.health.level!.points.every((p) => p[1] === 1));
  // WETH holds all the collateral: its price ÷ the health factor, the card's rule.
  assert.equal(levelAt({ ...hv.health, ...hv.marks[W] }, 100)![1], 1250);
  // USDC, a debt: the price at which the health factor reaches 1.
  assert.ok(Math.abs(levelAt({ ...hv.health, ...hv.marks[U] }, 103)![1] - 3.36) < 1e-9);
  // Today's point is the card's health factor.
  const live = healthView(t, reads, { liveHf: 3 })!;
  assert.deepEqual(live.health.points[live.health.points.length - 1], [104, 3, null]);
  // A day with no debt has no point, and is a gap, not a carry.
  const repaid: FlowTimeline = {
    ...t,
    days: [...t.days, row(104, [{ side: "debt", asset: U, symbol: "USDC", amount: 0 }])],
    today: 106,
  };
  const r = healthView(repaid, reads, {})!;
  assert.equal(r.health.points[r.health.points.length - 1][0], 103);
  assert.equal(pricePieces(r.health, 100, 106).carried.length, 0);
  // The reads: the last event of each of the most recent days.
  const picks = healthReadPicks(
    [
      { blockNumber: 10, timestamp: 100 * D + 5, txHash: "0xa" },
      { blockNumber: 12, timestamp: 100 * D + 50, txHash: "0xb" },
      { blockNumber: 20, timestamp: 101 * D, txHash: "0xc" },
      { blockNumber: 30, timestamp: 102 * D, txHash: "0xd" },
    ],
    2,
  );
  assert.deepEqual(
    picks.map((e) => e.txHash),
    ["0xc", "0xd"],
  );
});

// ── Aave V4's health source (ui-jobs 328 step 5) ─────────────────────────────
test("Aave V4: factors by symbol, weighted across two hubs; levels are the card's assetLiqPrices", async () => {
  const { aaveV4FactorRead, aaveV4Levels } = await import("@/lib/aave-v4/flows-health");
  const { calculateAaveV4Position } = await import("@/lib/aave-v4/utils/position-calculation");
  const reserve = (symbol: string, supply: string, isCollateral: boolean, lt: number) => ({
    reserveId: 0,
    address: "0x",
    symbol,
    decimals: 18,
    supplyBalanceRaw: supply,
    debtBalanceRaw: "0",
    isCollateral,
    hasBorrow: false,
    lt,
  });
  const read = aaveV4FactorRead(
    {
      wallet: "0x",
      spoke: "main",
      spokeName: "Main",
      blockNumber: 100,
      healthFactor: 1.5,
      avgCollateralFactor: 0.8,
      riskPremiumRaw: "0",
      supplyAssetCount: 2,
      debtAssetCount: 1,
      chainStale: false,
      reserves: [
        reserve("WETH", "3000000000000000000", true, 0.8),
        reserve("WETH", "1000000000000000000", true, 0.6),
        reserve("USDC", "0", false, 0.78),
      ],
    },
    86_400 * 20_000 + 5,
  )!;
  assert.equal(read.day, 20_000);
  assert.equal(read.block, 100);
  assert.ok(Math.abs(read.lt.weth - 0.75) < 1e-12);
  assert.equal(read.lt.usdc, 0);

  // One collateral: its price ÷ the health factor.
  const one = aaveV4Levels(
    [
      { asset: "link", coll: 100, debt: 0, price: 10, lt: 0.7 },
      { asset: "usdt", coll: 0, debt: 400, price: 1, lt: 0 },
    ],
    1.75,
  );
  assert.deepEqual([...one], [["link", 10 / 1.75]]);

  // Several: calculateAaveV4Position's entries; a collateral the rest covers has none.
  const lines = [
    { asset: "weth", coll: 2, debt: 0, price: 2000, lt: 0.8 },
    { asset: "wsteth", coll: 1, debt: 0, price: 2400, lt: 0.8 },
    { asset: "aave", coll: 1, debt: 0, price: 100, lt: 0.7 },
    { asset: "usdc", coll: 0, debt: 3000, price: 1, lt: 0 },
  ];
  const many = aaveV4Levels(lines, 1);
  const want = calculateAaveV4Position({
    supplies: lines
      .filter((l) => l.coll > 0)
      .map((l) => ({ symbol: l.asset, amount: l.coll, price: l.price, lt: l.lt, collateralEnabled: true })),
    debts: [{ symbol: "usdc", amount: 3000, price: 1 }],
  }).assetLiqPrices.filter((a) => a.liqPrice != null && a.liqPrice > 0);
  assert.deepEqual([...many].sort(), want.map((a) => [a.symbol, a.liqPrice]).sort());
  assert.ok(!many.has("aave"));
});

// ── Compound V3, Compound V2 and Moonwell health sources (ui-jobs 328 step 5) ─
test("Comet and Comptroller sources: factors keyed as the timelines key them; today's levels from the card's read", async () => {
  const { cometFactorRead, cometCardLines } = await import("@/lib/compound/flows-health");
  const { ctokenCardLines, ctokenTodayRead } = await import("@/lib/shared/ctoken-health");
  const { basketLevels, cardLevels } = await import("@/lib/shared/flows-health");
  const read = cometFactorRead({ block: 7, factors: { "0xAB": { liquidate: 0.9 } } }, 86_400 * 20_000 + 1);
  assert.deepEqual(read, { day: 20_000, block: 7, lt: { "base-supply": 0, "coll:0xab": 0.9 } });

  // A Comet quoting in ETH: today's level is the read's share of its price,
  // at the chart's (dollar) price.
  const lines = cometCardLines({
    collateral: [
      {
        address: "0xAB",
        symbol: "wstETH",
        decimals: 18,
        balanceRaw: "2000000000000000000",
        price: 1.2,
        borrowCollateralFactor: 0.85,
        liquidateCollateralFactor: 0.9,
        liquidationFactor: 0.95,
      },
    ],
    supplyBalanceRaw: "0",
    borrowBalanceRaw: "1080000000000000000",
    baseDecimals: 18,
    basePrice: 1,
  } as never);
  const lv = cardLevels(lines, { "coll:0xab": 3000, "base-debt": 2500, "base-supply": 2500 });
  // debt 1.08 ÷ (2 × 0.9) = 0.6 ETH, half the 1.2 price: half the $3,000.
  assert.ok(Math.abs(lv["coll:0xab"] - 1500) < 1e-9);

  // A market not entered counts 0, its supply backing nothing.
  const markets = [
    { market: "weth", supplyUnderlying: 1, borrowUnderlying: 0, priceUsd: 2000, collateralFactor: 0.8, entered: true },
    {
      market: "usdc",
      supplyUnderlying: 500,
      borrowUnderlying: 1000,
      priceUsd: 1,
      collateralFactor: 0.85,
      entered: false,
    },
  ];
  assert.deepEqual(ctokenTodayRead({ blockNumber: 9, markets }, 86_400 * 3).lt, { weth: 0.8, usdc: 0 });
  const l = basketLevels(ctokenCardLines({ markets }));
  // WETH alone backs the debt: 1000 ÷ (1 × 0.8).
  assert.equal(l.get("weth"), 1250);
});

// ── MakerDAO's and Fluid's views in the card's terms (ui-jobs 328 step 5) ───
test("Maker and Fluid ratio views: the ratio against the line in force, the card's today, levels in the chart's unit", async () => {
  const { MAKER_HEALTH_SOURCE, makerMatReads } = await import("@/lib/makerdao/flows-health");
  const { FLUID_HEALTH_SOURCE, fluidHeldRead } = await import("@/lib/fluid/flows-health");
  const { healthView } = await import("@/lib/shared/flows-health");
  const C = "coll:ETH";
  const DB = "debt:DAI";
  const row = (day: number, balances: FlowTimeline["days"][number]["balances"]) => ({
    day,
    events: 1,
    tick: "both" as const,
    cum: {},
    balances,
    prices: [],
  });
  const t: FlowTimeline = {
    buckets: [],
    days: [
      row(100, [
        { side: "collateral", asset: C, symbol: "ETH", amount: 10 },
        { side: "debt", asset: DB, symbol: "DAI", amount: 6_000 },
      ]),
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: {
      [C]: [
        [100, 1500],
        [102, 1200],
      ],
      [DB]: [[100, 1]],
    },
    today: 103,
  };
  // The minimum ratio 1.5 at the first event, 1.45 filed on day 102.
  const reads = makerMatReads("ETH", { ts: 100 * D + 10, ilkAt: { block: 50, priceUsd: 1500, mat: 1.5, dustDai: 0 } }, [
    { block: 70, timestamp: 102 * D + 5, txHash: "0x1", mat: 1.45 },
  ])!;
  const hv = healthView(t, reads, { source: MAKER_HEALTH_SOURCE, liveHf: 2.2 / 1.45, liveLine: 1.45 })!;
  assert.equal(hv.health.unit, "ratio");
  assert.equal(hv.health.liquidates, "below");
  assert.equal(hv.health.sparseBefore, undefined);
  // Collateral 10 × 1,500 over 6,000 DAI: 250 %; the line 150 %, then 145 %.
  assert.deepEqual(
    hv.health.points.map((p) => [p[0], +p[1].toFixed(4), p[2]]),
    [
      [100, 2.5, 50],
      [101, 2.5, 50],
      [102, 2, 70],
      [103, 2.2, null],
    ],
  );
  assert.deepEqual(
    hv.health.level!.points.map((p) => [p[0], p[1]]),
    [
      [100, 1.5],
      [101, 1.5],
      [102, 1.45],
      [103, 1.45],
    ],
  );
  // The level: debt × mat ÷ ink, the card's "Liquidates at".
  assert.ok(Math.abs(levelAt({ ...hv.health, ...hv.marks[C] }, 100)![1] - 900) < 1e-9);
  assert.ok(Math.abs(levelAt({ ...hv.health, ...hv.marks[C] }, 102)![1] - 870) < 1e-9);

  // Fluid: a timeline in grains of the debt token (scale 2), today's
  // threshold held from the first day, the level drawn in the token.
  const G = 100;
  const f: FlowTimeline = {
    ...t,
    unit: { symbol: "USDT", scale: 2 },
    days: [
      row(100, [
        { side: "collateral", asset: "coll", symbol: "ETH", amount: 1 },
        { side: "debt", asset: "debt", symbol: "USDT", amount: 1_800 },
      ]),
    ],
    dailyPrices: { coll: [[100, 2_500 * G]], debt: [[100, G]] },
  };
  const fv = healthView(f, [fluidHeldRead(0.9, 999)!], { source: FLUID_HEALTH_SOURCE })!;
  assert.equal(fv.health.liquidates, "above");
  // 1,800 ÷ (1 × 2,500) = 72 %, against 90 % on every day.
  assert.ok(fv.health.points.every((p) => Math.abs(p[1] - 0.72) < 1e-9));
  assert.ok(fv.health.level!.points.every((p) => p[1] === 0.9));
  assert.equal(fv.health.sparseBefore, undefined);
  // 1,800 ÷ (1 × 0.9) = 2,000 USDT per ETH.
  assert.ok(Math.abs(levelAt({ ...fv.health, ...fv.marks.coll }, 101)![1] - 2_000) < 1e-9);
});

// ── Dolomite, Liquity V1 and Sky Savings (ui-jobs 328 step 5) ──────────────
test("Dolomite margin ratio: premiums on both sides, today's line held, the card's today, no level", async () => {
  const { DOLOMITE_HEALTH_SOURCE, dolomiteHeldRead } = await import("@/lib/dolomite/flows-health");
  const { healthView } = await import("@/lib/shared/flows-health");
  const row = (day: number, balances: FlowTimeline["days"][number]["balances"]) => ({
    day,
    events: 1,
    tick: "both" as const,
    cum: {},
    balances,
    prices: [],
  });
  const t: FlowTimeline = {
    buckets: [],
    days: [
      row(100, [
        { side: "collateral", asset: "0", symbol: "WETH", amount: 1 },
        { side: "debt", asset: "2", symbol: "USDC", amount: 1_000 },
      ]),
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: { "0": [[100, 2_000]], "2": [[100, 1]] },
    today: 102,
  };
  const risk = { block: 9, required: 1.15, override: false, ratio: 1.9 };
  // WETH's premium 0.25, USDC's 0.
  const read = dolomiteHeldRead(["0", "2"], { "0": 0.25, "2": 0 }, risk)!;
  // A market with no premium read leaves no read at all.
  assert.equal(dolomiteHeldRead(["0", "7"], { "0": 0.25 }, risk), null);
  const hv = healthView(t, [read], {
    source: DOLOMITE_HEALTH_SOURCE,
    liveHf: risk.ratio / risk.required,
    liveLine: risk.required,
  })!;
  assert.equal(hv.health.unit, "ratio");
  assert.equal(hv.health.digits, 2);
  // 2,000 ÷ 1.25 over 1,000 = 160 %, against 115 %; today the card's 190 %.
  assert.deepEqual(
    hv.health.points.map((p) => [p[0], +p[1].toFixed(6)]),
    [
      [100, 1.6],
      [101, 1.6],
      [102, 1.9],
    ],
  );
  assert.ok(hv.health.level!.points.every((p) => p[1] === 1.15));
  assert.deepEqual(hv.marks, {});
  // A borrowed market's premium multiplies its debt: USDC at 0.1.
  const r2 = dolomiteHeldRead(["0", "2"], { "0": 0, "2": 0.1 }, risk)!;
  const h2 = healthView(t, [r2], { source: DOLOMITE_HEALTH_SOURCE })!;
  assert.ok(Math.abs(h2.health.points[0][1] - 2_000 / 1_100) < 1e-9);
  // The override skips the premiums.
  const r3 = dolomiteHeldRead(["0", "2"], { "0": 0.25, "2": 0.1 }, { ...risk, override: true, required: 1.1111 })!;
  const h3 = healthView(t, [r3], { source: DOLOMITE_HEALTH_SOURCE })!;
  assert.ok(Math.abs(h3.health.points[0][1] - 2) < 1e-9);
});

test("Liquity V1's level: debt × 110 % ÷ collateral after each event, no accrual, Recovery Mode named", () => {
  const v1 = (o: Parameters<typeof lqEv>[0]) => lqEv({ rate: 0, fee: 0, ...o });
  const evs = [
    v1({ id: "a_1", ts: 100 * D + 3600, block: 1000, collAfter: 10, debtAfter: 10_000, debtOp: 10_000 }),
    v1({ id: "b_1", ts: 102 * D + 7200, block: 1200, collAfter: 20, debtAfter: 10_000, collOp: 10, debtOp: 0 }),
  ];
  const t = liquityFlowTimeline(evs, {
    collSymbol: "ETH",
    debtSymbol: "LUSD",
    family: "v1",
    live: { price: 2100, coll: 20, debt: 10_200 },
    surplusClaimed: false,
    now: 104 * D + 100,
    priceView: { collateralType: "ETH" },
  })!;
  const [s] = flowPriceSeries(t);
  assert.equal(s.asset.symbol, "ETH");
  assert.equal(levelAt(s, 101)![1], (10_000 * 1.1) / 10);
  assert.equal(levelAt(s, 103)![1], (10_000 * 1.1) / 20);
  // Today the card's: the entire debt × 1.1 ÷ the entire collateral.
  assert.equal(levelAt(s, 104)![1], (10_200 * 1.1) / 20);
  assert.equal(s.level!.formula, "debt × 110% ÷ collateral after each event");
  assert.ok(s.level!.summary.includes("Recovery Mode is not drawn"));
  assert.ok(s.help!.includes("Recovery Mode"));
});

test("Sky Savings: the share price in place of the sUSDS price, chi per day at its drip block, the card's today", async () => {
  const { skyShareLine } = await import("@/lib/sky-savings/flows");
  const RAY = (x: number) => BigInt(Math.round(x * 1e9)) * BigInt(1e18);
  const chiDaily = [
    { day: 98, date: "", lastDripBlock: 50, chiAtDayEnd: RAY(1.01).toString() },
    { day: 99, date: "", lastDripBlock: 60, chiAtDayEnd: RAY(1.0101).toString() },
    { day: 101, date: "", lastDripBlock: 80, chiAtDayEnd: RAY(1.0103).toString() },
  ];
  const s = skyShareLine(chiDaily, 100, { block: 99, chi: RAY(1.0105).toString() }, 102)!;
  assert.deepEqual(
    s.points.map((p) => [p[0], +p[1].toFixed(6), p[2]]),
    [
      [99, 1.0101, 60],
      [101, 1.0103, 80],
      [102, 1.0105, 99],
    ],
  );
  const t: FlowTimeline = {
    buckets: [],
    days: [
      {
        day: 100,
        events: 1,
        tick: "collateral",
        cum: {},
        balances: [{ side: "collateral", asset: "0xs", symbol: "sUSDS", amount: 5 }],
        prices: [],
      },
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: { "0xs": [[100, 1.02]] },
    shareLine: { asset: "0xs", series: s, unitLabel: "USDS", name: "sUSDS share price", digits: 6 },
  };
  const ps = flowPriceSeries(t);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].key, "sky-savings:chi");
  assert.equal(ps[0].unitLabel, "USDS");
  assert.equal(ps[0].level, undefined);
  assert.equal(formatPrice(1.0105, "USDS", 6), "1.010500 USDS");
});
