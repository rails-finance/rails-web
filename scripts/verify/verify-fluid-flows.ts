// verify-fluid-flows — a Fluid vault position's Lifetime flows
// (lib/fluid/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "Fluid").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the page's own routes
// (scripts/verify/fixtures/fluid-flows.json: /api/fluid/timeline and the live
// read /api/chain/fluid/position, both off victoria):
//
//   closed-repaid          #22 ETH / USDC: borrowed, repaid and withdrew in full
//   open-interest          #6 ETH / USDT: open since Mar 2024, interest on both sides
//   liquidated-open        #1309 WBTC / USDC: 42 events, liquidated four times, open
//   liquidated-ten-closed  #8873 ETH / USDT: liquidated ten times, then closed
//   absorbed               #3474 wstETH / USDC: absorbed by the vault (Feb 2025)
//   absorbed-transfers     #1504 ETH / USDC: 95 events, 23 NFT transfers, absorbed
//   supply-only            #348 sUSDe / USDT: never borrowed, one bar in sUSDe
//   unrecorded-fall        #6589 ETH / USDC: liquidated many times; on 7 Sep '26
//                          (block 25,946,739) both balances stand below the
//                          last row's with no liquidation row between
//
// Held: the replay meets every row's recorded balances and every liquidation
// its settled before and after; interest is never negative; at every event
// day, every day between and the live stop each side's printed lines add to
// its printed total; each event card's sum is exact, its token lines add to
// the recorded balance and its ledger adds; the daily line's points are the
// bars' figures; the live stop meets the live read; a liquidation row is
// priced by its row and the rest by the nearest priced moment; and the state
// card between events states the chart's grown figures.
//
// Three modes of every fixture. As read (`<name>`): the rows priced at
// liquidation blocks only, as the index served them before the server's event
// filler. Stored (`<name>+stored`): every balance-bearing row carries the
// price the filler stores (fixtures/fluid-stored-prices.json: server
// scripts/lib/fluid-prices.mjs's one batched read per block, each equal to
// the liquidation filler's single reads), mapped by the timeline transform.
// Daily (`<name>+daily`): stored, with a daily store series between events
// (synthetic: the latest event's price moved by a day-dependent step, so a
// quiet day's figure is the store's and no event's).
//
//   npx tsx --test scripts/verify/verify-fluid-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  FL,
  fluidFlowEvents,
  fluidFlowReplay,
  fluidFlowTimeline,
  fluidFocusEvents,
  fluidPricing,
  type FluidFlowOptions,
} from "@/lib/fluid/flows";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";
import { fluidOraclePriceOf } from "@/lib/sources/api/fluid-timeline";

interface Fixture {
  name: string;
  nft: string;
  status: "open" | "closed";
  collSymbol: string;
  debtSymbol: string;
  live: NonNullable<FluidFlowOptions["live"]>;
  events: BaseActivityEvent[];
  daily?: [number, number][];
}

interface StoredPrice {
  oracle: string;
  raw: string;
  source: "fluid-oracle-liquidate" | "fluid-oracle";
  penalty: number;
  /** The liquidation filler's single reads gave the same row. */
  single: boolean;
}

const FIX = join(__dirname, "fixtures", "fluid-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const STORED = (
  JSON.parse(readFileSync(join(__dirname, "fixtures", "fluid-stored-prices.json"), "utf8")) as {
    prices: Record<string, StoredPrice | null>;
  }
).prices;
/** 1 Oct 2026, 22:00 UTC: after every fixture's last row. */
const NOW = 1_790_892_000;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
const dataOf = (e: BaseActivityEvent) => (e.context as unknown as { data: Record<string, unknown> }).data;
const bears = (e: BaseActivityEvent) => !["mint", "transfer"].includes(dataOf(e).eventType as string);
const decimalsOf = (unit: number) => Math.round(-Math.log10(unit));

/** The fixture with every balance-bearing row carrying its stored price, as
 *  the timeline transform maps the server's row. */
function withStored(f: Fixture): Fixture {
  const ev = fluidFlowEvents(f.events);
  const colDec = decimalsOf(ev[0].colUnit);
  const debtDec = decimalsOf(ev[0].debtUnit);
  const events = f.events.map((e) => {
    if (!bears(e)) return e;
    const d = dataOf(e);
    const s = STORED[`${String(d.vault).toLowerCase()}:${e.blockNumber}`];
    assert.ok(s, `${f.name} ${e.id}: a stored price`);
    const price = fluidOraclePriceOf(
      { price_raw: s.raw, oracle: s.oracle, price_source: s.source, liquidation_penalty: s.penalty },
      colDec,
      debtDec,
    );
    assert.ok(price, `${f.name} ${e.id}: the transform maps it`);
    return { ...e, context: { ...e.context, data: { ...d, oraclePriceAtBlock: price } } } as BaseActivityEvent;
  });
  return { ...f, name: `${f.name}+stored`, events };
}

/** A synthetic daily series over the position's span: each day the latest
 *  event's price, moved by a step that depends on the day. */
function withDaily(f: Fixture): Fixture {
  const ev = fluidFlowEvents(f.events).filter((e) => e.price != null);
  const first = Math.floor(ev[0].ts / DAY);
  const last = Math.floor(NOW / DAY) - 1;
  const daily: [number, number][] = [];
  let i = 0;
  for (let d = first; d <= last; d++) {
    while (i + 1 < ev.length && Math.floor(ev[i + 1].ts / DAY) <= d) i++;
    daily.push([d, (ev[i].price as number) * (1 + 0.001 * ((d % 7) - 3))]);
  }
  return { ...f, name: f.name.replace("+stored", "+daily"), daily };
}

const STORED_ALL = ALL.map(withStored);
const MODES = [...ALL, ...STORED_ALL, ...STORED_ALL.map(withDaily)];
const MODE_NAMES = MODES.map((f) => f.name);
const fx = (name: string) => MODES.find((f) => f.name === name) as Fixture;
const base = (name: string) => name.split("+")[0];
const OUT = new Set<string>([FL.collOut, FL.collSeized, FL.repaid, FL.debtLiquidated]);
const COLL = new Set<string>([FL.collIn, FL.earned, FL.collOut, FL.collSeized]);

function opts(f: Fixture): FluidFlowOptions {
  return {
    collSymbol: f.collSymbol,
    debtSymbol: f.debtSymbol,
    now: NOW,
    open: f.status === "open",
    live: f.live,
    daily: f.daily ?? null,
  };
}
const rows = (f: Fixture) => fluidFlowEvents(f.events);
function model(f: Fixture): FlowModel {
  const t = fluidFlowTimeline(rows(f), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid",
    "open-interest",
    "liquidated-open",
    "liquidated-ten-closed",
    "absorbed",
    "absorbed-transfers",
    "supply-only",
    "unrecorded-fall",
  ]);
});

for (const name of MODE_NAMES) {
  test(`${name}: the replay meets every row's recorded balances`, () => {
    const f = fx(name);
    const ev = rows(f);
    const rp = fluidFlowReplay(ev, opts(f));
    let coll = 0;
    let debt = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.ev.id}: a positive leg`);
        const sign = OUT.has(l.bucket) ? -1 : 1;
        if (COLL.has(l.bucket)) coll += sign * l.amount;
        else debt += sign * l.amount;
      }
      assert.ok(near(coll, r.ev.colAfter), `${name} ${r.ev.id}: collateral ${coll} vs ${r.ev.colAfter}`);
      assert.ok(near(debt, r.ev.debtAfter), `${name} ${r.ev.id}: debt ${debt} vs ${r.ev.debtAfter}`);
    }
  });
}

test("every liquidation's lines are the vault's settled before and after", () => {
  let checked = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const rp = fluidFlowReplay(rows(f), opts(f));
    for (const r of rp.replayed) {
      if (r.ev.kind !== "liquidated" && r.ev.kind !== "absorbed") continue;
      const e = f.events.find((x) => x.id === r.ev.id)!;
      const c = (e.context as unknown as { data: Record<string, string> }).data;
      const seized = Number(c.liqSupplyBefore) - Number(c.liqSupplyAfter);
      const cleared = Number(c.liqBorrowBefore) - Number(c.liqBorrowAfter);
      const leg = (k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
      assert.ok(Math.abs(leg(FL.collSeized) - seized) <= 1e-9 * Math.max(1, seized), `${name} ${r.ev.id}: seized`);
      assert.ok(
        Math.abs(leg(FL.debtLiquidated) - cleared) <= 1e-9 * Math.max(1, cleared),
        `${name} ${r.ev.id}: cleared`,
      );
      assert.equal(r.priceFrom, "row", `${name} ${r.ev.id}: priced by its row (mig 114)`);
      checked++;
    }
  }
  // 4 + 10 + 1 + 1 + #6589's liquidations and absorbs.
  const extra = fx("unrecorded-fall").events.filter((e) =>
    ["liquidated", "absorbed"].includes((e.context as unknown as { data: { eventType: string } }).data.eventType),
  ).length;
  assert.equal(checked, 16 + extra);
});

test("the interest is the rows' gaps, and the open position's both sides earn and accrue", () => {
  const f = fx("open-interest");
  const rp = fluidFlowReplay(rows(f), opts(f));
  const sum = (k: string) =>
    rp.replayed.flatMap((r) => r.legs).reduce((a, l) => a + (l.bucket === k ? l.amount : 0), 0);
  assert.ok(sum(FL.earned) > 0, "collateral interest earned");
  assert.ok(sum(FL.accrued) > 0, "debt interest accrued");
  // Each row's interest is its before less the last row's after.
  let prevC = 0;
  let prevD = 0;
  for (const r of rp.replayed) {
    const e = r.legs.find((l) => l.bucket === FL.earned)?.amount ?? 0;
    const a = r.legs.find((l) => l.bucket === FL.accrued)?.amount ?? 0;
    assert.ok(near(e, Math.max(0, r.ev.colBefore - prevC)), `${r.ev.id}: earned`);
    assert.ok(near(a, Math.max(0, r.ev.debtBefore - prevD)), `${r.ev.id}: accrued`);
    prevC = r.ev.colAfter;
    prevD = r.ev.debtAfter;
  }
});

test("prices: a liquidation row's own, the rest the nearest priced moment", () => {
  const open = fluidFlowReplay(rows(fx("open-interest")), opts(fx("open-interest")));
  assert.deepEqual(
    fluidPricing(open),
    { row: 0, rowLiq: 0, nearest: 0, today: 3 },
    "no liquidation: today's oracle read",
  );
  for (const r of open.replayed) assert.equal(r.price, fx("open-interest").live.price);
  const absorbed = fluidFlowReplay(rows(fx("absorbed")), opts(fx("absorbed")));
  // Deposited Dec 2024 and Jan 2025, absorbed Feb 2025: the absorb is nearer
  // than today.
  const p = fluidPricing(absorbed);
  assert.equal(p.row, 1);
  assert.equal(p.today, 0);
  assert.equal(p.nearest, 2);
  const absorbRow = absorbed.replayed.find((r) => r.ev.kind === "absorbed")!;
  for (const r of absorbed.replayed) assert.equal(r.price, absorbRow.price);
});

test("a position that never borrowed is one bar in its collateral token", () => {
  const f = fx("supply-only");
  const t = fluidFlowTimeline(rows(f), opts(f))!;
  assert.equal(t.unit?.symbol, "sUSDe");
  assert.ok(!t.buckets.some((b) => b.side === "debt"), "one bar");
  const m = buildFlowModel(t)!;
  const st = stateAt(m, m.liveStop);
  assert.equal(st.debt.now, 0);
  assert.ok(Math.abs(st.collateral.now / 10 ** t.unit!.scale - f.live.coll!) < 1e-6, "today is the live read");
});

for (const name of MODE_NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
    assert.ok(m.unit, "a token axis");
    const unit = base(name) === "supply-only" ? f.collSymbol : f.debtSymbol;
    for (let stop = 0; stop <= m.liveStop; stop++) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const r = sideSumRows(st[side], m.unit);
        assert.equal(
          r.lines.reduce((a, l) => a + l.dollars, 0),
          r.total.dollars,
          `${name} ${side} at stop ${stop}: lines add`,
        );
        const src = st[side].sources.reduce((a, s) => a + s.value, 0);
        assert.ok(Math.abs(src - st[side].total) < 1e-6 * Math.max(1, st[side].total), `${name} ${side} ${stop}`);
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${unit}`), l.amount);
      }
    }
    const end = stateAt(m, m.liveStop);
    if (f.status === "closed") {
      assert.equal(end.collateral.now, 0, `${name}: closed`);
      assert.equal(end.debt.now, 0, `${name}: closed`);
    } else {
      // Today meets the live read.
      const G = 10 ** m.unit!.scale;
      if (base(name) !== "supply-only")
        assert.ok(Math.abs(end.debt.now / G - f.live.debt!) < 1e-6 * Math.max(1, f.live.debt!), `${name}: debt now`);
      const collNow = f.live.coll! * (base(name) === "supply-only" ? 1 : f.live.price!);
      assert.ok(Math.abs(end.collateral.now / G - collNow) < 1e-6 * Math.max(1, collNow), `${name}: collateral now`);
    }
  });
}

for (const name of MODE_NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const ev = rows(f);
    const m = model(f);
    const rp = fluidFlowReplay(ev, opts(f));
    const focus = fluidFocusEvents(rp, f.collSymbol, f.debtSymbol);
    assert.equal(focus.length, ev.length);
    const lastOfTx = new Map<string, (typeof rp.replayed)[number]>();
    for (const r of rp.replayed) lastOfTx.set(r.ev.tx ?? r.ev.id, r);
    const sides = rp.borrower ? (["collateral", "debt"] as const) : (["collateral"] as const);
    let ledgerRows = 0;
    for (const fe of focus) {
      const cum = eventCum(m, focus, fe.id);
      assert.ok(cum, `${name} ${fe.id}: its day`);
      assert.ok(cum.exact, `${name} ${fe.id}: the legs add to the day row's move`);
      for (const side of sides) {
        const usd = eventSideSum(m, side, cum, fe.sides![side].after);
        assert.equal(
          usd.lines.reduce((a, l) => a + l.dollars, 0),
          usd.total.dollars,
          `${name} ${fe.id} ${side}: lines add`,
        );
        const sum = eventTokenSum(m, focus, side, cum, fe.id);
        assert.ok(sum, `${name} ${fe.id} ${side}: a token sum`);
        const scale = 10 ** sum.decimals;
        const r = lastOfTx.get(fe.tx ?? fe.id)!;
        const recorded = Math.max(0, side === "debt" ? r.debt : r.coll);
        assert.equal(sum.total.units, Math.round(recorded * scale), `${name} ${fe.id} ${side}: the recorded balance`);
        assert.equal(
          sum.lines.reduce((a, l) => a + l.units, 0),
          sum.total.units,
          `${name} ${fe.id} ${side}: token lines add`,
        );
        const l = tokenLedger({ model: m, side, ev: fe, sum, usd: null });
        assert.ok(ledgerAdds(l).tokens, `${name} ${fe.id} ${side}: the ledger adds`);
        ledgerRows += l.rows.length;
      }
    }
    assert.ok(ledgerRows > 0);
  });
}

for (const name of MODE_NAMES) {
  test(`${name}: the line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = fluidFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const bin = seriesRouteBinFor(t.today! - startDay);
    const series = binSeries(binInputFromTimeline(t)!, bin)!;
    assert.equal(series.gaps.length, 0, "no gaps");
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      const stop = to - startDay;
      if (stop >= m.liveStop) continue;
      const st = stateAt(m, stop);
      assert.ok(
        Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6),
        `${name} coll ${to}: ${collateral} vs ${st.collateral.now}`,
      );
      assert.ok(
        Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1, st.debt.now * 1e-6),
        `${name} debt ${to}: ${debt} vs ${st.debt.now}`,
      );
    }
  });
}

test("between events the debt grows at the rate the vault charged until the next row", () => {
  const f = fx("liquidated-open");
  const t = fluidFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const rp = fluidFlowReplay(rows(f), opts(f));
  const G = rp.grain;
  const startDay = m.start / 86_400_000;
  // A pair of rows more than two days apart, with debt between them.
  const i = rp.replayed.findIndex(
    (r, k) =>
      k + 1 < rp.replayed.length &&
      r.debt > 0 &&
      Math.floor(rp.replayed[k + 1].ev.ts / DAY) - Math.floor(r.ev.ts / DAY) > 2 &&
      (rp.replayed[k + 1].legs.find((l) => l.bucket === FL.accrued)?.amount ?? 0) > 0,
  );
  assert.ok(i >= 0, "a quiet stretch with interest");
  const a = rp.replayed[i];
  const b = rp.replayed[i + 1];
  const day = Math.floor(a.ev.ts / DAY) + 1;
  const owed = stateAt(m, day - startDay).debt.now / G;
  assert.ok(owed > a.debt && owed < b.ev.debtBefore, `owed ${owed} between ${a.debt} and ${b.ev.debtBefore}`);
  const expected = a.debt * (1 + rp.borrowRate[i] * (((day + 1) * DAY - a.ev.ts) / 31_557_600));
  assert.ok(Math.abs(owed - expected) < 1e-6 * expected, `${owed} vs ${expected}`);
});

test("the state card between events states the chart's grown figures", () => {
  const f = fx("open-interest");
  const m = model(f);
  const rp = fluidFlowReplay(rows(f), opts(f));
  const focus = fluidFocusEvents(rp, f.collSymbol, f.debtSymbol);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let stop = 1; stop < m.liveStop; stop += 7) {
    if (m.eventDays.includes(stop)) continue;
    const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
    if (!mo) continue;
    const d = mo.sides.debt.assets[0];
    if (!d) continue;
    checked++;
    assert.equal(d.grown?.basis, "fluid-rows");
    const chart = stateAt(m, stop).debt.now / rp.grain;
    assert.ok(Math.abs(d.tokens - chart) < 1e-9 * Math.max(1, chart), `stop ${stop}`);
    assert.ok((d.interest ?? 0) > 0, "interest since the last event");
  }
  assert.ok(checked > 10);
});

test("a fall between events with no row is booked as a liquidation, and only there", () => {
  for (const name of NAMES) {
    const f = fx(name);
    const rp = fluidFlowReplay(rows(f), opts(f));
    const falls = rp.replayed.filter((r) => r.unrecorded);
    if (name !== "unrecorded-fall") {
      assert.equal(falls.length, 0, `${name}: no unrecorded fall`);
      continue;
    }
    assert.equal(falls.length, 1);
    const r = falls[0];
    assert.equal(r.ev.block, 25_946_739);
    assert.equal(r.ev.kind, "withdraw_payback");
    const leg = (k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
    assert.ok(Math.abs(leg(FL.collSeized) - 0.01407552) < 1e-8, `seized ${leg(FL.collSeized)}`);
    assert.ok(Math.abs(leg(FL.debtLiquidated) - 19.625377) < 1e-6, `cleared ${leg(FL.debtLiquidated)}`);
    // The row's own act is the owner's.
    assert.ok(leg(FL.collOut) > 0 && leg(FL.repaid) > 0);
  }
});

test("stored prices: each batched read is the liquidation filler's single read, and a liquidation row's is its served price", () => {
  for (const [key, s] of Object.entries(STORED)) {
    assert.ok(s, `${key}: a price`);
    assert.ok(s.single, `${key}: the batch and the single reads agree`);
  }
  let checked = 0;
  for (const name of NAMES) {
    const served = fluidFlowEvents(fx(name).events);
    const stored = fluidFlowEvents(fx(`${name}+stored`).events);
    served.forEach((r, i) => {
      if (r.price == null) return;
      assert.equal(stored[i].price, r.price, `${name} ${r.id}: the stored price gives the served figure`);
      checked++;
    });
  }
  assert.ok(checked >= 16, `${checked} liquidation rows`);
});

test("stored prices: every collateral flow is valued at its own block, a liquidation's figures unchanged", () => {
  for (const name of NAMES) {
    const asRead = fluidFlowReplay(rows(fx(name)), opts(fx(name)));
    const stored = fluidFlowReplay(rows(fx(`${name}+stored`)), opts(fx(`${name}+stored`)));
    const p = fluidPricing(stored);
    assert.equal(p.nearest + p.today, 0, `${name}: nothing priced from another moment`);
    if (stored.borrower) assert.ok(p.row > 0, `${name}: priced by the rows`);
    stored.replayed.forEach((r, i) => {
      const a = asRead.replayed[i];
      assert.deepEqual(r.legs, a.legs, `${name} ${r.ev.id}: the same token legs`);
      if (a.priceFrom === "row") assert.equal(r.price, a.price, `${name} ${r.ev.id}: the liquidation's price`);
    });
  }
  // #6 never liquidated: as read, every flow took today's oracle read.
  const open = fluidFlowReplay(rows(fx("open-interest+stored")), opts(fx("open-interest+stored")));
  assert.deepEqual(fluidPricing(open), { row: 3, rowLiq: 0, nearest: 0, today: 0 });
  assert.ok(
    open.replayed.every((r) => r.price !== fx("open-interest").live.price),
    "no row at today's price",
  );
});

test("the daily store: a quiet day takes the store's price, an event day its row's", () => {
  for (const name of NAMES) {
    const f = fx(`${name}+daily`);
    const t = fluidFlowTimeline(rows(f), opts(f))!;
    const rp = fluidFlowReplay(rows(f), opts(f));
    if (!rp.borrower) continue;
    const G = rp.grain;
    const obs = new Map(t.dailyPrices!.coll);
    const eventDays = new Map(rp.replayed.map((r) => [Math.floor(r.ev.ts / DAY), r.price * G]));
    let quiet = 0;
    for (const [d, p] of f.daily!) {
      const want = eventDays.get(d) ?? p * G;
      assert.equal(obs.get(d), want, `${name} day ${d}`);
      if (!eventDays.has(d)) quiet++;
    }
    assert.ok(quiet > 0, `${name}: quiet days`);
    assert.match(t.words!.linePrices!, /each day's close/, `${name}: the line names the store`);
  }
});
