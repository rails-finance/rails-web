// verify-dolomite-flows — a Dolomite account's Lifetime flows
// (lib/dolomite/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Dolomite").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the page's own routes
// (scripts/verify/fixtures/dolomite-flows.json): each account's timeline
// (every row carries the market's supply and borrow index at its block), the
// live read from /api/chain/dolomite/position, and each market's daily price
// from the shared store (/api/prices/daily, series dolomite:<market id>):
//
//   closed-repaid      0xdf3e…0af1 #5326…4890: 114 rows on three markets,
//                      borrowed by transfers out to account 0, repaid in full
//                      and everything sent back
//   open-interest      0x49d6…caf6 #1580…8946: open since Jan 2026 on four
//                      markets, interest on both sides
//   liquidated-closed  0xd6fd…bb6f #4445…2825: liquidated once, nothing left
//   open-liquidated    0xe831…7e22 #5326…5319: liquidated three times, open
//   trade              0x02ca…9acf #1228…3606: a zap, USD1 in by transfer,
//                      sold for sUSDe, sent out
//   liquidator         0xb200…fbfb #0: the liquidator on seven liquidations,
//                      paying past its balance (Borrowed to liquidate)
//   crossings          0x8ff5…db97 #3657…6580: 93 rows, eight acts that cross
//                      zero, open with debt
//
// Held: the replay meets every row's recorded balance and every act its row's
// deltaWei (to two base units); interest is never negative and is the row's
// own `interestSincePrevious`; each extra bucket books as the header of
// lib/dolomite/flows.ts says; at every event day, every day between and the
// live stop, each side's printed lines add to its printed total; each event
// card's sum is exact, its token lines add to the balance at the printed
// decimals, its ledger adds in tokens and in dollars, and its figure at each
// day's last event is the bars' that day; the daily line's points are the
// bars' figures; a quiet day takes the store's price, and without the store
// the last event's; between events a balance grows by its market's index;
// today is the live read; and a row the route prices at its block (server
// branch dolomite-flows, `oracle_price`) is valued at that price.
//
//   npx tsx --test scripts/verify/verify-dolomite-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent, DolomiteContext } from "@/lib/shared/types/event-shape";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";
import type { DolomiteTimelineResult } from "@/lib/sources/api/dolomite-timeline";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";
import {
  DL,
  dolomiteEventStates,
  dolomiteFlowReplay,
  dolomiteFlowRows,
  dolomiteFlowTimeline,
  dolomiteFocusEvents,
  dolomiteLegSign,
  dolomitePricing,
  dolomiteSeriesKey,
  isDolomiteSupplyBucket,
  type DolomiteFlowOptions,
  type DolomiteFlowRow,
} from "@/lib/dolomite/flows";
import { dolomiteLive } from "@/hooks/useDolomiteFlows";
import { dailyPricesFromAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { assetTokenSum, assetTokenSumFor, eventAssetSum, eventCum, eventSideSumByAsset } from "@/lib/shared/flow-focus";
import { assetLedgers, ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";

interface Fixture {
  name: string;
  owner: string;
  accountNumber: string;
  timeline: WireTimeline<DolomiteTimelineResult>;
  chain: DolomiteChainResponse;
}

const FIX = join(__dirname, "fixtures", "dolomite-flows.json");
const J = JSON.parse(readFileSync(FIX, "utf8")) as { capturedAt: number; daily: DailyAnswer; fixtures: Fixture[] };
const ALL = J.fixtures;
/** 1 Oct 2026, 21:46 UTC: when the live reads were taken. */
const NOW = J.capturedAt;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
const eventsOf = (f: Fixture): BaseActivityEvent[] => fromTimelineWire<DolomiteTimelineResult>(f.timeline).events;
const rows = (f: Fixture): DolomiteFlowRow[] => {
  const r = dolomiteFlowRows(eventsOf(f), f.owner);
  assert.ok(r, `${f.name}: every row carries its index`);
  return r;
};
const STORE = dailyPricesFromAnswer(J.daily);
function daily(f: Fixture): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {};
  for (const m of new Set(rows(f).map((r) => r.market))) {
    const obs = STORE[dolomiteSeriesKey(m)];
    if (obs) out[m] = obs;
  }
  return out;
}
const opts = (f: Fixture, store = true): DolomiteFlowOptions => ({
  now: NOW,
  live: dolomiteLive(f.chain),
  ...(store ? { dailyPrices: daily(f) } : {}),
});
function model(f: Fixture, store = true): FlowModel {
  const t = dolomiteFlowTimeline(rows(f), opts(f, store));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-12) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const dataOf = (e: BaseActivityEvent) => (e.context as { data: DolomiteContext }).data;

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid",
    "open-interest",
    "liquidated-closed",
    "open-liquidated",
    "trade",
    "liquidator",
    "crossings",
  ]);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's balance, every act its deltaWei, and the rows' interest`, () => {
    const f = fx(name);
    const evs = eventsOf(f);
    const rp = dolomiteFlowReplay(rows(f), opts(f));
    assert.equal(rp.replayed.length, evs.filter((e) => dataOf(e).eventType !== "call").length, "every row");
    const bal = new Map<string, number>();
    for (const r of rp.replayed) {
      const m = r.ev.market;
      const unit = 10 ** -r.ev.decimals;
      const scale = Math.max(1, Math.abs(r.ev.before), Math.abs(r.ev.after));
      let interest = 0;
      for (const l of r.legs) {
        // A supply line adds to the signed balance, a debt line takes from it.
        const signed = dolomiteLegSign(l.bucket) * l.amount * (isDolomiteSupplyBucket(l.bucket) ? 1 : -1);
        bal.set(m, (bal.get(m) ?? 0) + signed);
        if (l.bucket === DL.earned || l.bucket === DL.accrued) {
          assert.ok(l.amount > -unit, `${name} ${r.ev.id}: interest ${l.amount}`);
          interest += l.amount;
        }
      }
      assert.ok(near(bal.get(m) ?? 0, r.ev.after), `${name} ${r.ev.id}: balance ${bal.get(m)} vs ${r.ev.after}`);
      // The act is the emitted deltaWei, to the core's rounding of par × index.
      if (r.ev.amount != null)
        assert.ok(
          Math.abs(r.ev.after - r.ev.before - r.ev.amount) <= 2 * unit + 1e-15 * scale,
          `${name} ${r.ev.id}: act ${r.ev.after - r.ev.before} vs ${r.ev.amount}`,
        );
      // The interest is the row's own figure from the index at both rows.
      const own = Number(dataOf(evs.find((e) => e.id === r.ev.id)!).interestSincePrevious ?? 0);
      assert.ok(Math.abs(interest - own) <= 2 * unit + 1e-14 * scale, `${name} ${r.ev.id}: ${interest} vs ${own}`);
    }
    // Every row is priced by the store on its day.
    const p = dolomitePricing(rp);
    assert.equal(p.nearest + p.none + p.carried, 0, `${name}: ${JSON.stringify(p)}`);
  });
}

test("closed-repaid: every debt repaid, everything sent back, transfers with the wallet's other accounts", () => {
  const f = fx("closed-repaid");
  const t = dolomiteFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const end = stateAt(m, m.liveStop);
  assert.ok(end.collateral.now < 0.01 && end.debt.now < 0.01, "nothing held or owed");
  const keys = t.buckets.map((b) => b.key);
  for (const k of [DL.borrowedSent, DL.repaidTransfer, DL.received, DL.sent, DL.accrued, DL.earned])
    assert.ok(keys.includes(k), k);
  assert.ok(!keys.includes(DL.liquidated) && !keys.includes(DL.seized), "never liquidated");
  assert.ok(
    rows(f)
      .filter((r) => r.kind.startsWith("transfer"))
      .every((r) => r.ownTransfer),
    "every transfer with an account of the same wallet",
  );
  const last = Math.max(...rows(f).map((r) => r.ts));
  assert.equal(t.today, Math.floor(last / DAY) + 1, "the slider stops the day after the last event");
});

for (const name of ["liquidated-closed", "open-liquidated"]) {
  test(`${name}: each liquidation repays debt and seizes collateral, linked`, () => {
    const f = fx(name);
    const rp = dolomiteFlowReplay(rows(f), opts(f));
    const liq = rp.replayed.filter((r) => r.ev.kind === "liquidation");
    const seize = rp.replayed.filter((r) => r.ev.kind === "seize_out");
    assert.ok(liq.length > 0 && liq.length === seize.length, `${name}: ${liq.length} liquidations`);
    // The debt leg books its interest and Repaid by liquidators; the
    // collateral leg its interest and Seized in liquidations.
    for (const r of liq) {
      assert.ok(
        r.legs.some((l) => l.bucket === DL.liquidated),
        r.ev.id,
      );
      assert.ok(
        r.legs.every((l) => l.bucket === DL.liquidated || l.bucket === DL.accrued),
        r.ev.id,
      );
    }
    for (const r of seize) {
      assert.ok(
        r.legs.some((l) => l.bucket === DL.seized),
        r.ev.id,
      );
      assert.ok(
        r.legs.every((l) => l.bucket === DL.seized || l.bucket === DL.earned),
        r.ev.id,
      );
    }
    const t = dolomiteFlowTimeline(rows(f), opts(f))!;
    for (const k of [DL.seized, DL.liquidated])
      assert.equal(t.buckets.find((b) => b.key === k)?.link, "liquidation", `${k} linked`);
    // A liquidation is no transaction of the owner's.
    for (const r of [...liq, ...seize]) assert.equal(r.ev.byOwner, false);
  });
}

test("trade: what was sold leaves one market and what was bought enters the other", () => {
  const f = fx("trade");
  const rp = dolomiteFlowReplay(rows(f), opts(f));
  const sold = rp.replayed.find((r) => r.legs.some((l) => l.bucket === DL.sold));
  const bought = rp.replayed.find((r) => r.legs.some((l) => l.bucket === DL.bought));
  assert.ok(sold && bought, "both sides of the trade");
  assert.equal(sold!.ev.tx, bought!.ev.tx, "one transaction");
  assert.notEqual(sold!.ev.market, bought!.ev.market, "two markets");
  // The two legs' dollars are the same trade at the day's prices.
  const usd = (r: typeof sold) => r!.legs.find((l) => l.bucket !== DL.earned)!.amount * r!.price;
  assert.ok(Math.abs(usd(sold) - usd(bought)) / usd(sold) < 0.02, `${usd(sold)} vs ${usd(bought)}`);
});

test("liquidator: the debt it paid and the collateral it took", () => {
  const f = fx("liquidator");
  const t = dolomiteFlowTimeline(rows(f), opts(f))!;
  const keys = t.buckets.map((b) => b.key);
  for (const k of [DL.seizedIn, DL.paidOut, DL.borrowedLiq]) assert.ok(keys.includes(k), k);
  const rp = dolomiteFlowReplay(rows(f), opts(f));
  for (const r of rp.replayed.filter((x) => x.ev.kind === "seize_in"))
    assert.ok(
      r.legs.some((l) => l.bucket === DL.seizedIn),
      r.ev.id,
    );
});

test("crossings: an act across zero splits into its supply and its debt part", () => {
  const f = fx("crossings");
  const rp = dolomiteFlowReplay(rows(f), opts(f));
  const crossing = rp.replayed.filter((r) => Math.sign(r.ev.before) * Math.sign(r.ev.after) < 0);
  assert.ok(crossing.length >= 4, `${crossing.length} crossings`);
  for (const r of crossing) {
    const acts = r.legs.filter((l) => l.bucket !== DL.earned && l.bucket !== DL.accrued);
    assert.equal(acts.length, 2, `${r.ev.id}: two parts`);
    const supply = acts.find((l) => isDolomiteSupplyBucket(l.bucket))!;
    const debt = acts.find((l) => !isDolomiteSupplyBucket(l.bucket))!;
    assert.ok(near(supply.amount, Math.abs(r.ev.before > 0 ? r.ev.before : r.ev.after)), `${r.ev.id}: supply part`);
    assert.ok(near(debt.amount, Math.abs(r.ev.before < 0 ? r.ev.before : r.ev.after)), `${r.ev.id}: debt part`);
  }
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const m = model(fx(name));
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
      }
    }
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, its tokens add to the balance and its ledger adds`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = dolomiteFlowReplay(rows(f), opts(f));
    const focus = dolomiteFocusEvents(rp);
    const states = dolomiteEventStates(rp, opts(f));
    const startDay = m.start / 86_400_000;
    let ledgers = 0;
    for (let i = 0; i < focus.length; i++) {
      const fe = focus[i];
      const st = states.get(fe.id)!;
      const cum = eventCum(m, focus, fe.id);
      assert.ok(cum?.exact, `${name} ${fe.id}: the legs add to the day row's move`);
      for (const side of ["collateral", "debt"] as const) {
        if (side === "debt" && !rp.borrower) continue;
        const held = st.held[side];
        assert.ok(held != null, `${name} ${fe.id} ${side}: priced`);
        const sum = eventAssetSum(m, focus, side, cum, fe.id, st.balances[side], {
          interestLabel: "Interest since the last event",
          relDust: 1e-9,
        });
        assert.ok(sum, `${name} ${fe.id} ${side}: a sum by asset`);
        for (const b of st.balances[side]) {
          const t = assetTokenSumFor(sum, b.symbol);
          assert.equal(
            t.lines.reduce((a, l) => a + l.units, 0),
            t.total.units,
            `${name} ${fe.id} ${side} ${b.symbol}: token lines add`,
          );
          assert.equal(t.total.units, Math.round(b.amount * 10 ** t.decimals), `${name} ${fe.id}: the balance`);
        }
        const single = assetTokenSum(sum);
        const lgs = single
          ? [
              tokenLedger({
                model: m,
                side,
                ev: fe,
                sum: single,
                usd: (() => {
                  const d = eventSideSumByAsset(m, sum, cum, held);
                  return { lines: d.lines, dollars: d.total.dollars, before: st.heldBefore[side] };
                })(),
              }),
            ]
          : assetLedgers({ model: m, side, ev: fe, sum, held, heldBefore: st.heldBefore[side] }).assets;
        for (const l of lgs) {
          const adds = ledgerAdds(l);
          assert.ok(adds.tokens && adds.usd, `${name} ${fe.id} ${side}: the ledger adds`);
          ledgers++;
        }
      }
      // The card at a day's last event is the bars' figure that day, to the
      // interest between the event and the day's close.
      const day = Math.floor(fe.ts / DAY);
      const lastOfDay = i === focus.length - 1 || Math.floor(focus[i + 1].ts / DAY) !== day;
      if (lastOfDay && day - startDay < m.liveStop) {
        const bars = stateAt(m, day - startDay);
        for (const side of ["collateral", "debt"] as const) {
          const card = st.held[side] ?? 0;
          const bar = bars[side].now;
          assert.ok(
            Math.abs(card - bar) <= Math.max(1, bar * 1e-3),
            `${name} ${fe.id} ${side}: card ${card} vs bars ${bar}`,
          );
        }
      }
    }
    assert.ok(ledgers > 0);
  });
}

for (const name of NAMES) {
  test(`${name}: the daily line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = dolomiteFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const bin = seriesRouteBinFor(t.today! - startDay);
    const series = binSeries(binInputFromTimeline(t)!, bin)!;
    assert.equal(series.gaps.length, 0, "no gaps");
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      const st = stateAt(m, to - startDay);
      assert.ok(Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6), `coll ${to}`);
      assert.ok(Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1, st.debt.now * 1e-6), `debt ${to}`);
    }
  });
}

test("a quiet day takes the store's price; without the store, the last event's", () => {
  for (const name of ["open-interest", "crossings"]) {
    const f = fx(name);
    const store = daily(f);
    const t = dolomiteFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const eventDays = new Set(rows(f).map((r) => Math.floor(r.ts / DAY)));
    let checked = 0;
    for (let stop = 0; stop < m.liveStop && checked < 40; stop++) {
      const day = startDay + stop;
      if (eventDays.has(day)) continue;
      for (const h of m.heldAt[stop]) {
        const market = rows(f).find((r) => r.symbol === h.symbol)!.market;
        const p = store[market]?.find(([d]) => d === day)?.[1];
        if (p == null || !(h.amount! > 0)) continue;
        assert.ok(near(h.usd! / h.amount!, p, 1e-9), `${name} ${h.symbol} day ${day}: ${h.usd! / h.amount!} vs ${p}`);
        checked++;
      }
    }
    assert.ok(checked > 0, `${name}: a quiet held day`);
    // The store unread: the panel still builds, each market on its last event's price.
    const carried = dolomiteFlowTimeline(rows(f), opts(f, false))!;
    assert.ok(buildFlowModel(carried), `${name}: carried`);
    assert.ok(carried.seriesCarry, "carries");
  }
});

test("open positions: between events a balance grows by its market's index, and today is the live read", () => {
  let checked = 0;
  for (const name of ["open-interest", "crossings"]) {
    const f = fx(name);
    const t = dolomiteFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const rp = dolomiteFlowReplay(rows(f), opts(f));
    const last = new Map<string, (typeof rp.replayed)[number]>();
    for (const r of rp.replayed) last.set(r.ev.market, r);
    const startDay = m.start / 86_400_000;
    for (const [market, r] of last) {
      const l = f.chain.balances.find((b) => String(b.marketId) === market);
      if (!l || !(r.debt > 0) || !(-l.wei > r.debt)) continue;
      // Halfway from the last row to today: more than the row, less than now.
      const day = Math.floor((r.ev.ts + NOW) / 2 / DAY) - startDay;
      const owed = m.heldAt[day].find((h) => h.side === "debt" && h.symbol === r.ev.symbol);
      assert.ok(owed?.grown, `${name} ${market}: grown by the index`);
      assert.equal(owed!.grown!.basis, "dolomite-rows");
      assert.ok(owed!.amount! > r.debt && owed!.amount! < -l.wei, `${name} ${market} ${owed!.amount}`);
      checked++;
    }
    // Today: each market as the live read states it.
    for (const h of m.liveHeld) {
      const l = f.chain.balances.find((b) => b.symbol === h.symbol);
      assert.ok(l, `${name} ${h.symbol}: in the live read`);
      assert.ok(near(h.amount ?? 0, Math.abs(l!.wei), 1e-12), `${name} ${h.symbol}: ${h.amount} vs ${l!.wei}`);
    }
  }
  assert.ok(checked > 0, "an open debt");
});

test("a row the route prices at its block (oracle_price) is valued there, the store's day price elsewhere", () => {
  const f = fx("open-liquidated");
  const evs = eventsOf(f);
  // The server branch dolomite-flows serves each row's stored oracle price;
  // written in here on every other row, 1% over the day's price.
  const day = (ts: number, m: string) => STORE[dolomiteSeriesKey(m)]?.find(([d]) => d === Math.floor(ts / DAY))?.[1];
  const priced = evs.map((e, i) => {
    const d = dataOf(e);
    const p = day(e.timestamp, String(d.marketId));
    if (i % 2 === 1 || p == null) return e;
    return {
      ...e,
      context: { ...e.context, data: { ...d, oraclePrice: { usd: p * 1.01, raw: "0" } } },
    } as BaseActivityEvent;
  });
  const r = dolomiteFlowRows(priced, f.owner)!;
  const rp = dolomiteFlowReplay(r, opts(f));
  const p = dolomitePricing(rp);
  assert.ok(p.block > 0 && p.day > 0, JSON.stringify(p));
  for (const x of rp.replayed) {
    if (x.basis !== "block") continue;
    assert.ok(near(x.price, x.ev.price!, 1e-15), x.ev.id);
  }
  // The panel still adds up at every stop.
  const t = dolomiteFlowTimeline(r, opts(f))!;
  const m = buildFlowModel(t)!;
  for (let stop = 0; stop <= m.liveStop; stop++) {
    const st = stateAt(m, stop);
    for (const side of ["collateral", "debt"] as const) {
      const s = sideSumRows(st[side], m.unit);
      assert.equal(
        s.lines.reduce((a, l) => a + l.dollars, 0),
        s.total.dollars,
      );
    }
  }
});
