// verify-morpho-flows — a Morpho Blue position's Lifetime flows
// (lib/morpho/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "Morpho").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the page's own routes
// (scripts/verify/fixtures/morpho-flows.json), with the market oracle at each
// row's block from /api/chain/morpho/at-block where the row carries none:
//
//   eth-liquidated-repaid  Ethereum USDC / PT-apxUSD-5NOV2026 908b…006e,
//                          0x5b5a…5a73: borrowed, liquidated on 21 Jun '26
//                          (collateral left), borrowed again and repaid in full
//   eth-bad-debt           Ethereum USDC / sNUSD ae60…7cb4, 0x35b5…66d: borrowed,
//                          liquidated to zero collateral on 26 Sep '26, 165.87
//                          USDC written off as bad debt
//   base-lender-closed     Base USDC / KTA 6b52…f225, 0x9f03…81db: supplied
//                          twice, withdrew all with 2.155075 USDC interest
//   base-lender-open       Base eUSD / cbBTC c965…b45, 0x9f03…81db: supplying
//   base-borrower-then-lender  Base USDC / yoUSD 1a3e…9137, 0xd5d3…beaee:
//                          borrowed against collateral, repaid in full, then lent
//
// Held: the replay meets every row's recorded balances; at every event day,
// every day between and the live stop, each side's printed lines add to its
// printed total; each event card's sum is exact, its token lines add to the
// recorded balance at the printed decimals and its ledger adds; the daily
// line's points are the bars' figures; and the state card between events
// states the chart's figures.
//
//   npx tsx --test scripts/verify/verify-morpho-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  MO,
  morphoFlowEvents,
  morphoFlowReplay,
  morphoFlowTimeline,
  morphoFocusEvents,
  morphoPriceBlocks,
  type MorphoFlowEvent,
  type MorphoFlowOptions,
} from "@/lib/morpho/flows";
import { buildFlowModel, formatFlowUsd, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows, wholeUsd } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";

interface Fixture {
  name: string;
  chain: number;
  loanSymbol: string;
  collateralSymbol: string;
  lltv: number;
  badDebt: number;
  status?: string;
  events: BaseActivityEvent[];
  prices: Record<string, { price: number; borrowApr: number | null }>;
}

const FIX = join(__dirname, "fixtures", "morpho-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
/** 1 Oct 2026, 18:00 UTC: after every fixture's last row. */
const NOW = 1_790_877_600;
const DAY = 86_400;

function rows(f: Fixture): MorphoFlowEvent[] {
  const prices = new Map(Object.entries(f.prices).map(([b, p]) => [Number(b), p.price]));
  return morphoFlowEvents(f.events, prices);
}
function opts(f: Fixture, live: MorphoFlowOptions["live"] = null): MorphoFlowOptions {
  return { loanSymbol: f.loanSymbol, collSymbol: f.collateralSymbol, lltv: f.lltv, now: NOW, live };
}
function model(f: Fixture): FlowModel {
  const t = morphoFlowTimeline(rows(f), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}

/** Every event day, every day between, and the live stop. */
function everyStop(m: FlowModel): number[] {
  const out: number[] = [];
  for (let s = 0; s <= m.liveStop; s++) out.push(s);
  return out;
}

const NAMES = ALL.map((f) => f.name);

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "eth-liquidated-repaid",
    "eth-bad-debt",
    "base-lender-closed",
    "base-lender-open",
    "base-borrower-then-lender",
  ]);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's recorded balances`, () => {
    const f = fx(name);
    const ev = rows(f);
    const rp = morphoFlowReplay(ev, opts(f));
    let coll = 0;
    let debt = 0;
    let supply = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        const sign = [
          MO.collOut,
          MO.collSeized,
          MO.withdrawn,
          MO.supplyLoss,
          MO.repaid,
          MO.debtLiquidated,
          MO.badDebt,
        ].includes(l.bucket as never)
          ? -1
          : 1;
        if (l.bucket === MO.collIn || l.bucket === MO.collOut || l.bucket === MO.collSeized) coll += sign * l.amount;
        else if ([MO.supplied, MO.earned, MO.withdrawn, MO.supplyLoss].includes(l.bucket as never))
          supply += sign * l.amount;
        else debt += sign * l.amount;
      }
      const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
      if (r.ev.collAfter != null) assert.ok(near(coll, r.ev.collAfter), `${name} ${r.ev.id}: collateral ${coll}`);
      if (r.ev.debtAfter != null) assert.ok(near(debt, r.ev.debtAfter), `${name} ${r.ev.id}: debt ${debt}`);
      if (r.ev.supplyAfter != null) assert.ok(near(supply, r.ev.supplyAfter), `${name} ${r.ev.id}: supply ${supply}`);
      // Interest is never negative on the debt.
      for (const l of r.legs) if (l.bucket === MO.accrued) assert.ok(l.amount > -1e-9, `${name}: interest ${l.amount}`);
    }
  });
}

test("the lender's interest is the supply's gaps, to the base unit", () => {
  const rp = morphoFlowReplay(rows(fx("base-lender-closed")), opts(fx("base-lender-closed")));
  const earned = rp.replayed.flatMap((r) => r.legs).filter((l) => l.bucket === MO.earned);
  const sum = earned.reduce((a, l) => a + l.amount, 0);
  assert.ok(Math.abs(sum - 2.155075) < 1e-9, `earned ${sum}`);
  assert.deepEqual(rp.roles, { borrower: false, lender: true });
  const t = morphoFlowTimeline(rows(fx("base-lender-closed")), opts(fx("base-lender-closed")))!;
  assert.equal(t.labels?.collateral, "Supplied");
  assert.ok(!t.buckets.some((b) => b.side === "debt"), "one bar");
  assert.equal(t.unit?.symbol, "USDC");
  // The closed lender: the bar at the close is 545.82 supplied + 2.16 earned
  // = 547.97 withdrawn, nothing held.
  const m = buildFlowModel(t)!;
  const st = stateAt(m, m.liveStop).collateral;
  const sum2 = sideSumRows(st, m.unit);
  const amounts = Object.fromEntries(sum2.lines.map((l) => [l.key, l.amount]));
  assert.equal(amounts[MO.supplied], "545.82 USDC");
  assert.equal(amounts[MO.earned], "2.16 USDC");
  // 547.974929 withdrawn: the lines are rounded together to the cent so
  // they add to nothing held, and the cent lands on the withdrawal.
  assert.equal(amounts[MO.withdrawn], "547.98 USDC");
  assert.equal(sum2.total.amount, "0.00 USDC");
});

test("a liquidation to zero collateral writes the rest of the debt off as bad debt", () => {
  const f = fx("eth-bad-debt");
  const rp = morphoFlowReplay(rows(f), opts(f));
  const liq = rp.replayed.find((r) => r.ev.kind === "liquidation")!;
  const leg = (k: string) => liq.legs.find((l) => l.bucket === k)?.amount ?? 0;
  // The summary's bad debt (Σ the Liquidate logs' badDebtAssets) to the cent.
  assert.ok(Math.abs(leg(MO.badDebt) - f.badDebt) < 0.01, `bad debt ${leg(MO.badDebt)} vs ${f.badDebt}`);
  assert.ok(Math.abs(leg(MO.debtLiquidated) + leg(MO.badDebt) - 1362.957449) < 1e-9, "the debt cleared");
  assert.ok(Math.abs(leg(MO.collSeized) - 1154.102644098668) < 1e-9, "the collateral seized");
  assert.ok(Math.abs(leg(MO.accrued) - 295.773801) < 1e-9, "the interest since the previous row");
});

test("a liquidation that leaves collateral writes nothing off", () => {
  const f = fx("eth-liquidated-repaid");
  const rp = morphoFlowReplay(rows(f), opts(f));
  const liq = rp.replayed.find((r) => r.ev.kind === "liquidation")!;
  assert.equal(
    liq.legs.find((l) => l.bucket === MO.badDebt),
    undefined,
  );
  assert.ok(Math.abs((liq.legs.find((l) => l.bucket === MO.debtLiquidated)?.amount ?? 0) - 82029.417185) < 1e-6);
  assert.equal(liq.ownPrice, true, "priced by the row (mig 112)");
  // Every collateral flow priced at its block.
  for (const r of rp.replayed)
    if (r.legs.some((l) => l.bucket === MO.collIn || l.bucket === MO.collOut)) assert.ok(r.ownPrice, r.ev.id);
  assert.equal(morphoPriceBlocks(rows(f)).length, 0, "nothing left to read");
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
    assert.ok(m.unit, "a token axis");
    for (const stop of everyStop(m)) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const r = sideSumRows(st[side], m.unit);
        const printed = r.lines.reduce((a, l) => a + l.dollars, 0);
        assert.equal(printed, r.total.dollars, `${name} ${side} at stop ${stop}: lines add`);
        // The bar's sources add to its length.
        const src = st[side].sources.reduce((a, s) => a + s.value, 0);
        assert.ok(Math.abs(src - st[side].total) < 1e-6 * Math.max(1, st[side].total), `${name} ${side} ${stop}`);
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${f.loanSymbol}`), l.amount);
      }
    }
    // A closed position holds nothing at the close.
    const end = stateAt(m, m.liveStop);
    if (name !== "base-lender-open") assert.equal(end.collateral.now, 0, `${name}: closed`);
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const ev = rows(f);
    const m = model(f);
    const rp = morphoFlowReplay(ev, opts(f));
    const focus = morphoFocusEvents(rp, f.loanSymbol, f.collateralSymbol);
    assert.equal(focus.length, ev.length);
    const lastOfTx = new Map<string, (typeof rp.replayed)[number]>();
    for (const r of rp.replayed) lastOfTx.set(r.ev.tx ?? r.ev.id, r);
    const sides = rp.roles.borrower ? (["collateral", "debt"] as const) : (["collateral"] as const);
    let rows2 = 0;
    for (const fe of focus) {
      const cum = eventCum(m, focus, fe.id);
      assert.ok(cum, `${name} ${fe.id}: its day`);
      assert.ok(cum.exact, `${name} ${fe.id}: the legs add to the day row's move`);
      for (const side of sides) {
        if (side === "collateral" && rp.roles.borrower && rp.roles.lender) continue;
        const held = fe.sides![side].after;
        const usd = eventSideSum(m, side, cum, held);
        assert.equal(
          usd.lines.reduce((a, l) => a + l.dollars, 0),
          usd.total.dollars,
          `${name} ${fe.id} ${side}: lines add`,
        );
        const sum = eventTokenSum(m, focus, side, cum, fe.id);
        assert.ok(sum, `${name} ${fe.id} ${side}: a token sum`);
        const scale = 10 ** sum.decimals;
        const r = lastOfTx.get(fe.tx ?? fe.id)!;
        const recorded = Math.max(0, side === "debt" ? r.debt : rp.roles.borrower ? r.coll : r.supply);
        assert.equal(sum.total.units, Math.round(recorded * scale), `${name} ${fe.id} ${side}: the recorded balance`);
        assert.equal(
          sum.lines.reduce((a, l) => a + l.units, 0),
          sum.total.units,
          `${name} ${fe.id} ${side}: token lines add`,
        );
        const l = tokenLedger({ model: m, side, ev: fe, sum, usd: null });
        assert.ok(ledgerAdds(l).tokens, `${name} ${fe.id} ${side}: the ledger adds`);
        rows2 += l.rows.length;
      }
    }
    assert.ok(rows2 > 0);
  });
}

for (const name of NAMES) {
  test(`${name}: the daily line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = morphoFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const span = t.today! - m.start / 86_400_000;
    const bin = seriesRouteBinFor(span);
    const series = binSeries(binInputFromTimeline(t)!, bin)!;
    assert.equal(series.gaps.length, 0, "no gaps");
    if (bin !== "day") return;
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      const st = stateAt(m, to - m.start / 86_400_000);
      assert.ok(Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6), `coll ${to}`);
      assert.ok(Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1, st.debt.now * 1e-6), `debt ${to}`);
    }
  });
}

test("between events the debt grows at the rate the market charged until the next row", () => {
  const f = fx("eth-liquidated-repaid");
  const t = morphoFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const rp = morphoFlowReplay(rows(f), opts(f));
  const G = rp.grain;
  const startDay = m.start / 86_400_000;
  // The repay on 9 Jul '26 (1783597643) states 94,545.440098 owed before it;
  // the day before it closes between that and the 94,306.217663 of 24 Jun.
  const before = rp.replayed.find((r) => r.ev.ts === 1783597643)!;
  const dayBefore = Math.floor(before.ev.ts / DAY) - 1 - startDay;
  const owed = stateAt(m, dayBefore).debt.now / G;
  assert.ok(owed > 94306.217663 && owed < 94545.440098, `owed ${owed}`);
  // On the day of the next row the line meets that row's balance.
  const at = Math.floor(before.ev.ts / DAY) - startDay;
  const r = rp.replayed.filter((x) => Math.floor(x.ev.ts / DAY) === Math.floor(before.ev.ts / DAY)).pop()!;
  const close = stateAt(m, at).debt.now / G;
  const expected =
    r.debt *
    (1 + rp.borrowRate[rp.replayed.indexOf(r)] * (((Math.floor(r.ev.ts / DAY) + 1) * DAY - r.ev.ts) / 31_557_600));
  assert.ok(Math.abs(close - expected) < 1e-6, `${close} vs ${expected}`);
});

test("the state card between events states the chart's debt, in the loan token", () => {
  const f = fx("eth-liquidated-repaid");
  const ev = rows(f);
  const m = model(f);
  const rp = morphoFlowReplay(ev, opts(f));
  const focus = morphoFocusEvents(rp, f.loanSymbol, f.collateralSymbol);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let stop = 1; stop < m.liveStop; stop++) {
    if (m.eventDays.includes(stop)) continue;
    const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
    if (!mo) continue;
    const debt = mo.sides.debt;
    if (debt.assets.length === 0) continue;
    checked++;
    assert.equal(debt.face, true);
    const chart = stateAt(m, stop).debt.now / rp.grain;
    assert.ok(Math.abs(debt.assets[0].tokens - chart) < 1e-9 * Math.max(1, chart), `stop ${stop}`);
    // The collateral is stated in tokens: no oracle price is recorded that day.
    for (const a of mo.sides.collateral.assets) assert.equal(a.usd, null);
  }
  assert.ok(checked > 0);
});

test("token figures: compact, whole and spoken", () => {
  const unit = { symbol: "WETH", scale: 4 };
  assert.equal(formatFlowUsd(123_456, unit), "12.3 WETH");
  assert.equal(formatFlowUsd(5_000_000, unit), "500 WETH");
  assert.equal(formatFlowUsd(315, unit), "0.0315 WETH");
  assert.equal(wholeUsd(123_456, unit), "12.3456 WETH");
  assert.equal(wholeUsd(-90_118, { symbol: "USDC", scale: 0 }), "90,118 USDC");
  assert.equal(formatFlowUsd(82_029, { symbol: "USDC", scale: 0 }), "82k USDC");
});
