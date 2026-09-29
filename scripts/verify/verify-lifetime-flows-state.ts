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
// route's `lifetime`.
//
//   npx tsx --test scripts/verify/verify-lifetime-flows-state.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import type { AaveLaneInterest } from "@/lib/aave-v3/lane-interest";
import { computeAaveV3Economics } from "@/lib/aave-v3/chain-truth-tower";
import {
  AAVE_V3_FLOW_BUCKETS,
  aaveV3FlowEvents,
  aaveV3FlowSeriesTimeline,
  aaveV3FlowTimeline,
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
  assetsAt,
  axisFor,
  buildFlowModel,
  daysFromEvents,
  dayStart,
  formatFlowUsd,
  nextEventDay,
  prevEventDay,
  stateAt,
  type FlowModel,
  type FlowSideState,
  type FlowTimeline,
} from "@/lib/shared/flows-timeline";
import { formatDate } from "@/lib/date";

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
  assert.ok(near(seg(s.collateral, "collateral-interest"), usdSum(c.earned)));
  assert.ok(near(seg(s.collateral, "collateral-price"), c.priceChange?.usd ?? NaN, 0.5));
  assert.ok(near(s.collateral.out, usdSum(c.exited) + usdSum(c.liquidated)));
  assert.ok(near(seg(s.debt, "borrowed"), d.lifetimeInflow));
  assert.ok(near(seg(s.debt, "debt-interest"), (d.interest?.usd ?? 0) + usdSum(d.earned)));
  assert.ok(near(seg(s.debt, "debt-price"), d.priceChange?.usd ?? NaN, 0.5));
  assert.ok(near(s.debt.out, usdSum(d.exited) + usdSum(d.liquidated)));
  // The brief's prototype read 5.5k of debt interest off the balancing item;
  // the ledger's method gives 5.2k.
  assert.equal(formatFlowUsd(seg(s.debt, "debt-interest")), "$5.2k");
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

test("the number format", () => {
  assert.equal(formatFlowUsd(363.4), "$363");
  assert.equal(formatFlowUsd(5_473), "$5.5k");
  assert.equal(formatFlowUsd(123_024), "$123k");
  assert.equal(formatFlowUsd(-5_000), "−$5.0k");
  assert.equal(formatFlowUsd(1_234_567), "$1.2M");
  assert.equal(formatFlowUsd(9_999.7), "$10k");
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
  const live = { collateralUsd: 0, debtUsd: 0, collateralInterestUsd: null, debtInterestUsd: null };
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
    live: { collateralUsd: 300, debtUsd: 0, collateralInterestUsd: null, debtInterestUsd: null },
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
    const live = { collateralUsd: 0, debtUsd: 0, collateralInterestUsd: null, debtInterestUsd: null };
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

test("SparkLend: the ledger's in and out meet the route's buckets at the live stop, transfers and the treasury fee included", () => {
  const legs = readJson<{
    tokens: Record<string, { symbol: string; decimals: number }>;
    cases: { wallet: string; rows: Parameters<typeof sparkRowsToEvents>[0] }[];
  }>("spark-flow-legs.json");
  const metas = new Map(Object.entries(legs.tokens).map(([address, t]) => [address, { address, ...t, named: true }]));
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

test("Aave V4: the route's day rows reproduce the event-level answer at every event day, one spoke position", () => {
  const legs = readJson<{ cases: { wallet: string; spoke: string; events: BaseActivityEvent[] }[] }>(
    "aave-v4-flow-legs.json",
  );
  const live = { collateralUsd: 0, debtUsd: 0, collateralInterestUsd: null, debtInterestUsd: null };
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
