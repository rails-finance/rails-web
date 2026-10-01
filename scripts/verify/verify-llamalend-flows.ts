// verify-llamalend-flows — a LlamaLend position's Lifetime flows
// (lib/llamalend/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "LlamaLend").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the page's routes
// (scripts/verify/fixtures/llamalend-flows.json: /api/llamalend/timeline, the
// live read /api/chain/llamalend/position, and the AMM's price_oracle at every
// row's block, /api/chain/llamalend/liq-price, all off victoria and the
// archive):
//
//   closed-repaid       wstETH / crvUSD 0x1e01…4d71 / 0x1b95…abd5: borrowed,
//                       repaid and withdrew in full (12 events)
//   open-interest       wstETH / crvUSD mint 0x100d…c6ce / 0xeb2c…ac2b: open
//                       since Jul 2023 (15 events)
//   open-in-bands       WETH / crvUSD 0xaade…267b / 0x8f1e…6c2d: open, two
//                       spells in its bands, the AMM's sales between events
//   liquidated-twice    WETH / crvUSD mint 0xa920…9635 / 0x1d73…3a3c (4 events)
//   liquidated-partial  weETH / crvUSD 0x652a…6b11 / 0x9c28…9112: three hard
//                       liquidations (one partial), a self-liquidation and
//                       seven underwater repays that state no collateral
//   bought-back         WETH / crvUSD mint 0xa920…9635 / 0xa801…a018: the AMM
//                       bought collateral back between events (51 events)
//   partial-last        WETH / crvUSD mint 0xa920…9635 / 0x5755…6b14: open,
//                       its last row a partial liquidation with no after-image
//   tbtc-borrowed       crvUSD / tBTC 0xe438…21b8 / 0x07cb…4d76: a market
//                       that lends tBTC, liquidated (34 events)
//
// Held: the replay meets every row's stated balances to the base unit and
// moves an unstated row by its amounts; the debt's interest is the row's
// gap and never negative; the collateral's gap past the AMM's rounding is the
// AMM's trade; a hard liquidation's lines are its amounts; at every day
// and the live stop each side's printed lines add to its printed total; each
// event card's sum is exact, its token lines add to the recorded balance and
// its ledger adds; the daily line's points are the bars' figures; the live
// stop meets the live read; the debt grows between rows at the rate to the
// next; the state card between events states the chart's grown debt; and a
// row whose block was not read takes the nearest read price.
//
//   npx tsx --test scripts/verify/verify-llamalend-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  LL,
  llamalendFlowEvents,
  llamalendFlowFacts,
  llamalendFlowReplay,
  llamalendFlowTimeline,
  llamalendFocusEvents,
  type LlamalendFlowOptions,
} from "@/lib/llamalend/flows";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";

interface Fixture {
  name: string;
  controller: string;
  user: string;
  status: "open" | "closed" | "liquidated";
  collSymbol: string;
  debtSymbol: string;
  live: { price: number; coll: number; debt: number; converted: number | null } | null;
  events: BaseActivityEvent[];
  /** The AMM's oracle price at each row's block. */
  prices: Record<string, number>;
  /** The position at the end of the block of each row with no after-image
   *  (the card's /api/chain/llamalend/event-state read), base units. */
  states: Record<string, { coll: string; debt: string }>;
}

const FIX = join(__dirname, "fixtures", "llamalend-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
/** 1 Oct 2026, 23:00 UTC: after every fixture's last row. */
const NOW = 1_790_895_600;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
/** Each fixture as read, and without the archive's reads of the rows that
 *  state no after-image (`<name>+unread`). */
const MODES = [...ALL, ...ALL.map((f) => ({ ...f, name: `${f.name}+unread`, states: {} }))];
const MODE_NAMES = MODES.map((f) => f.name);
const fx = (name: string) => MODES.find((f) => f.name === name) as Fixture;
const stateMap = (f: Fixture) =>
  new Map(Object.entries(f.states).map(([b, v]) => [Number(b), { coll: BigInt(v.coll), debt: BigInt(v.debt) }]));
const priceMap = (f: Fixture) => new Map(Object.entries(f.prices).map(([b, p]) => [Number(b), p]));
const OUT = new Set<string>([LL.collOut, LL.softSold, LL.collSeized, LL.repaid, LL.debtLiquidated]);
const COLL = new Set<string>([LL.collIn, LL.boughtBack, LL.collOut, LL.softSold, LL.collSeized]);

function opts(f: Fixture): LlamalendFlowOptions {
  return {
    collSymbol: f.collSymbol,
    debtSymbol: f.debtSymbol,
    now: NOW,
    open: f.status === "open",
    live: f.live,
  };
}
const rows = (f: Fixture) => llamalendFlowEvents(f.events, priceMap(f), stateMap(f));
function model(f: Fixture): FlowModel {
  const t = llamalendFlowTimeline(rows(f), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const human = (v: bigint, d: number) => Number(v) / 10 ** d;

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid",
    "open-interest",
    "open-in-bands",
    "liquidated-twice",
    "liquidated-partial",
    "bought-back",
    "partial-last",
    "tbtc-borrowed",
  ]);
});

for (const name of MODE_NAMES) {
  test(`${name}: the replay meets every row's stated balances, and an unstated row moves by its amounts`, () => {
    const f = fx(name);
    const ev = rows(f);
    const rp = llamalendFlowReplay(ev, opts(f));
    let coll = 0;
    let debt = 0;
    let prevColl = 0;
    let prevDebt = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.ev.id}: a positive leg`);
        const sign = OUT.has(l.bucket) ? -1 : 1;
        if (COLL.has(l.bucket)) coll += sign * l.amount;
        else debt += sign * l.amount;
      }
      const cd = r.ev.collDecimals;
      const dd = r.ev.debtDecimals;
      if (r.ev.collAfter != null) assert.ok(near(coll, human(r.ev.collAfter, cd)), `${name} ${r.ev.id}: collateral`);
      else assert.ok(near(coll, Math.max(0, prevColl + human(r.ev.collDelta, cd))), `${name} ${r.ev.id}: unstated`);
      if (r.ev.debtAfter != null) assert.ok(near(debt, human(r.ev.debtAfter, dd)), `${name} ${r.ev.id}: debt`);
      else assert.ok(near(debt, Math.max(0, prevDebt + human(r.ev.debtDelta, dd))), `${name} ${r.ev.id}: unstated`);
      assert.ok(near(coll, r.coll) && near(debt, r.debt), `${name} ${r.ev.id}: the row's balances`);
      prevColl = coll;
      prevDebt = debt;
    }
  });
}

test("the debt's interest is each row's gap to the base unit, never negative", () => {
  let rowsWithInterest = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const rp = llamalendFlowReplay(rows(f), opts(f));
    let prev = BigInt(0);
    for (const r of rp.replayed) {
      const a = r.legs.find((l) => l.bucket === LL.accrued)?.amount ?? 0;
      assert.ok(a >= 0);
      if (r.ev.debtAfter != null) {
        const gap = r.ev.debtAfter - r.ev.debtDelta - prev;
        assert.ok(gap >= BigInt(0), `${name} ${r.ev.id}: a gap below zero`);
        assert.ok(near(a, human(gap, r.ev.debtDecimals)), `${name} ${r.ev.id}: accrued ${a}`);
        if (gap > BigInt(0)) rowsWithInterest++;
        prev = r.ev.debtAfter;
      } else prev = prev + r.ev.debtDelta > BigInt(0) ? prev + r.ev.debtDelta : BigInt(0);
    }
  }
  assert.ok(rowsWithInterest > 50, `${rowsWithInterest} rows with interest`);
});

test("the AMM's trades between events: sold and bought back where the collateral's gap passes its rounding", () => {
  const sold = (n: string) => llamalendFlowFacts(llamalendFlowReplay(rows(fx(n)), opts(fx(n))), null);
  // 13 Jun 2024: 0.0175 wstETH of 387 sold between the day's borrow and repay.
  assert.equal(sold("closed-repaid").softSold, 1, "one spell in its bands");
  assert.equal(sold("open-interest").softSold + sold("open-interest").boughtBack, 0, "never in its bands");
  assert.ok(sold("open-in-bands").softSold > 0, "the AMM sold between events");
  assert.ok(sold("bought-back").boughtBack > 0, "the AMM bought back");
  assert.ok(sold("liquidated-partial").softSold > 0);
  // Each traded leg is the gap.
  for (const name of NAMES) {
    const f = fx(name);
    const rp = llamalendFlowReplay(rows(f), opts(f));
    let prev = BigInt(0);
    for (const r of rp.replayed) {
      const s = r.legs.find((l) => l.bucket === LL.softSold)?.amount ?? 0;
      const b = r.legs.find((l) => l.bucket === LL.boughtBack)?.amount ?? 0;
      if (r.ev.collAfter != null) {
        const gap = human(r.ev.collAfter - r.ev.collDelta - prev, r.ev.collDecimals);
        if (s > 0) assert.ok(near(s, -gap), `${name} ${r.ev.id}: sold ${s} vs ${gap}`);
        if (b > 0) assert.ok(near(b, gap), `${name} ${r.ev.id}: bought back`);
        if (s === 0 && b === 0)
          assert.ok(
            Math.abs(gap) <= Math.max(1000 / 10 ** r.ev.collDecimals, human(prev, r.ev.collDecimals) * 1e-6) + 1e-18,
            `${name} ${r.ev.id}: an untraded gap within rounding`,
          );
        prev = r.ev.collAfter;
      } else {
        assert.equal(s + b, 0, `${name} ${r.ev.id}: no trade on an unstated row`);
        prev = prev + r.ev.collDelta > BigInt(0) ? prev + r.ev.collDelta : BigInt(0);
      }
    }
  }
});

test("a hard liquidation's lines are its amounts; a self-liquidation is Repaid and Withdrawn", () => {
  let hard = 0;
  let self = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const rp = llamalendFlowReplay(rows(f), opts(f));
    for (const r of rp.replayed) {
      if (r.ev.kind !== "liquidation") continue;
      const leg = (k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
      const taken = human(-r.ev.collDelta, r.ev.collDecimals);
      const cleared = human(-r.ev.debtDelta, r.ev.debtDecimals);
      if (r.ev.self) {
        self++;
        assert.ok(near(leg(LL.collOut), taken), `${name} ${r.ev.id}: withdrawn`);
        assert.ok(near(leg(LL.repaid), cleared), `${name} ${r.ev.id}: repaid`);
        assert.equal(leg(LL.collSeized) + leg(LL.debtLiquidated), 0);
      } else {
        hard++;
        assert.ok(near(leg(LL.collSeized), taken), `${name} ${r.ev.id}: seized ${leg(LL.collSeized)} vs ${taken}`);
        assert.ok(near(leg(LL.debtLiquidated), cleared), `${name} ${r.ev.id}: cleared`);
        assert.equal(leg(LL.collOut) + leg(LL.repaid), 0);
      }
    }
  }
  assert.ok(hard >= 6, `${hard} hard liquidations`);
  assert.ok(self >= 2, `${self} self-liquidations`);
});

for (const name of MODE_NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
    assert.equal(m.unit?.symbol, f.debtSymbol, "the borrowed token's axis");
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
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${f.debtSymbol}`), l.amount);
      }
    }
    const end = stateAt(m, m.liveStop);
    if (f.status !== "open") {
      assert.equal(end.collateral.now, 0, `${name}: closed`);
      assert.equal(end.debt.now, 0, `${name}: closed`);
    } else {
      const G = 10 ** m.unit!.scale;
      assert.ok(f.live, `${name}: a live read`);
      assert.ok(Math.abs(end.debt.now / G - f.live.debt) < 1e-6 * Math.max(1, f.live.debt), `${name}: debt now`);
      const collNow = f.live.coll * f.live.price;
      assert.ok(Math.abs(end.collateral.now / G - collNow) < 1e-6 * Math.max(1, collNow), `${name}: collateral now`);
    }
  });
}

for (const name of MODE_NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const ev = rows(f);
    const m = model(f);
    const rp = llamalendFlowReplay(ev, opts(f));
    const focus = llamalendFocusEvents(rp, f.collSymbol, f.debtSymbol);
    assert.equal(focus.length, ev.length);
    const lastOfTx = new Map<string, (typeof rp.replayed)[number]>();
    for (const r of rp.replayed) lastOfTx.set(r.ev.tx ?? r.ev.id, r);
    let ledgerRows = 0;
    for (const fe of focus) {
      const cum = eventCum(m, focus, fe.id);
      assert.ok(cum, `${name} ${fe.id}: its day`);
      assert.ok(cum.exact, `${name} ${fe.id}: the legs add to the day row's move`);
      for (const side of ["collateral", "debt"] as const) {
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
    const t = llamalendFlowTimeline(rows(f), opts(f))!;
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

test("between events the debt grows at the rate the market charged until the next row", () => {
  const f = fx("open-interest");
  const t = llamalendFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const rp = llamalendFlowReplay(rows(f), opts(f));
  const G = rp.grain;
  const startDay = m.start / 86_400_000;
  const i = rp.replayed.findIndex(
    (r, k) =>
      k + 1 < rp.replayed.length &&
      r.debt > 0 &&
      Math.floor(rp.replayed[k + 1].ev.ts / DAY) - Math.floor(r.ev.ts / DAY) > 2 &&
      (rp.replayed[k + 1].legs.find((l) => l.bucket === LL.accrued)?.amount ?? 0) > 0,
  );
  assert.ok(i >= 0, "a quiet stretch with interest");
  const a = rp.replayed[i];
  const b = rp.replayed[i + 1];
  const day = Math.floor(a.ev.ts / DAY) + 1;
  const owed = stateAt(m, day - startDay).debt.now / G;
  const before = human(b.ev.debtAfter! - b.ev.debtDelta, b.ev.debtDecimals);
  assert.ok(owed > a.debt && owed < before, `owed ${owed} between ${a.debt} and ${before}`);
  const expected = a.debt * (1 + rp.borrowRate[i] * (((day + 1) * DAY - a.ev.ts) / 31_557_600));
  assert.ok(Math.abs(owed - expected) < 1e-6 * expected, `${owed} vs ${expected}`);
  // The day before the next row the debt is just short of what that row found.
  const lastDay = Math.floor(b.ev.ts / DAY) - 1;
  const owedLate = stateAt(m, lastDay - startDay).debt.now / G;
  assert.ok(owedLate <= before + 1e-9 && owedLate > owed);
});

test("the state card between events states the chart's grown debt", () => {
  const f = fx("open-interest");
  const m = model(f);
  const rp = llamalendFlowReplay(rows(f), opts(f));
  const focus = llamalendFocusEvents(rp, f.collSymbol, f.debtSymbol);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let stop = 1; stop < m.liveStop; stop += 7) {
    if (m.eventDays.includes(stop)) continue;
    const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
    if (!mo) continue;
    const d = mo.sides.debt.assets[0];
    if (!d) continue;
    checked++;
    assert.equal(d.grown?.basis, "llamalend-rows");
    const chart = stateAt(m, stop).debt.now / rp.grain;
    assert.ok(Math.abs(d.tokens - chart) < 1e-9 * Math.max(1, chart), `stop ${stop}`);
    assert.ok((d.interest ?? 0) > 0, "interest since the last event");
    // The collateral is as its last event left it.
    const c = mo.sides.collateral.assets[0];
    if (c) assert.ok(!c.grown);
  }
  assert.ok(checked > 10, `${checked} state cards`);
});

test("prices: every row at its block's read; a row not read takes the nearest read price", () => {
  for (const name of NAMES) {
    const f = fx(name);
    const rp = llamalendFlowReplay(rows(f), opts(f));
    assert.ok(
      rp.replayed.every((r) => r.priceFrom === "row" && r.price === f.prices[String(r.ev.block)]),
      `${name}: each at its block`,
    );
  }
  // Half the blocks unread.
  const f = fx("bought-back");
  const all = priceMap(f);
  const half = new Map([...all].filter((_, i) => i % 2 === 0));
  const ev = llamalendFlowEvents(f.events, half);
  const rp = llamalendFlowReplay(ev, opts(f));
  const read = rp.replayed.filter((r) => r.priceFrom === "row").length;
  assert.ok(read > 0 && read < rp.replayed.length);
  for (const r of rp.replayed) {
    if (r.priceFrom === "row") continue;
    assert.equal(r.priceFrom, "nearest", "a closed position: never today's");
    // The nearest read row in time.
    const best = rp.replayed
      .filter((x) => x.priceFrom === "row")
      .reduce((a, x) => (Math.abs(x.ev.ts - r.ev.ts) < Math.abs(a.ev.ts - r.ev.ts) ? x : a));
    assert.equal(r.price, best.price, `${r.ev.id}`);
  }
  // No price read at all: every row takes today's read; with no live read
  // either there is no timeline.
  const open = fx("open-interest");
  const bare = llamalendFlowReplay(llamalendFlowEvents(open.events, null), opts(open));
  assert.ok(bare.replayed.every((r) => r.priceFrom === "today" && r.price === open.live!.price));
  const closed = fx("closed-repaid");
  assert.equal(llamalendFlowTimeline(llamalendFlowEvents(closed.events, null), { ...opts(closed), live: null }), null);
});

test("between events the collateral keeps its latest event's price; today's is the live read", () => {
  const f = fx("open-in-bands");
  const t = llamalendFlowTimeline(rows(f), opts(f))!;
  assert.equal(t.seriesCarry, true);
  const rp = llamalendFlowReplay(rows(f), opts(f));
  const obs = t.dailyPrices!.coll;
  const days = new Set(rp.replayed.map((r) => Math.floor(r.ev.ts / DAY)));
  for (const [d] of obs) assert.ok(days.has(d) || d === Math.floor(NOW / DAY), `day ${d}: an event day or today`);
  assert.equal(obs[obs.length - 1][1], f.live!.price * rp.grain);
});

test("open-in-bands: what the AMM sold since the last event is on its line at the live stop", () => {
  const f = fx("open-in-bands");
  const t = llamalendFlowTimeline(rows(f), opts(f))!;
  const rp = llamalendFlowReplay(rows(f), opts(f));
  const last = rp.replayed[rp.replayed.length - 1];
  const gap = f.live!.coll - last.coll;
  const tol = Math.max(1000 / 1e18, last.coll * 1e-6);
  if (Math.abs(gap) <= tol) {
    assert.equal(t.live.pending, undefined, "no trade since the last event");
    return;
  }
  assert.equal(t.live.pending?.length, 1);
  const p = t.live.pending![0];
  assert.equal(p.bucket, gap < 0 ? LL.softSold : LL.boughtBack);
  assert.ok(near(p.usd, Math.abs(gap) * f.live!.price * rp.grain));
});

test("the borrowed token need not be crvUSD: a tBTC market is drawn in tBTC", () => {
  const f = fx("tbtc-borrowed");
  assert.equal(f.debtSymbol, "tBTC");
  const t = llamalendFlowTimeline(rows(f), opts(f))!;
  assert.equal(t.unit?.symbol, "tBTC");
  // Borrowed up to 1.8 tBTC: figures to a thousandth of a tBTC.
  assert.equal(t.unit!.scale, 3);
});

test("a row with no after-image takes the archive's read at its block, which the replay meets", () => {
  let read = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const ev = rows(f);
    for (const e of ev) {
      const st = f.states[String(e.block)];
      if (!e.read) continue;
      read++;
      assert.ok(st, `${name} ${e.id}: a read`);
      assert.equal(e.collAfter, BigInt(st.coll));
      assert.equal(e.debtAfter, BigInt(st.debt));
    }
  }
  // 4 + 1 + 8 + 4 + 5 + 1 rows across the fixtures.
  assert.equal(read, 23);
  // partial-last: before the partial liquidation of 3 Feb 2025 the AMM had
  // sold 12.33 WETH; the read states the dust it left.
  const f = fx("partial-last");
  const t = llamalendFlowTimeline(rows(f), opts(f))!;
  const rp = llamalendFlowReplay(rows(f), opts(f));
  const last = rp.replayed[rp.replayed.length - 1];
  assert.equal(last.ev.kind, "liquidation");
  assert.ok(last.ev.read);
  assert.ok(last.coll < 0.01, `${last.coll} WETH after it`);
  // Since, the AMM bought back about 0.0001 WETH: under a dollar.
  assert.ok(
    (t.live.pending ?? []).every((x) => x.bucket === LL.boughtBack && x.usd < rp.grain),
    "dust since",
  );
});
