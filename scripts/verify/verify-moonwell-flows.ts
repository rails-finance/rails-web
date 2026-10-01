// verify-moonwell-flows — a Moonwell account's Lifetime flows, Base and
// Ethereum (lib/shared/ctoken-flows.ts, lib/moonwell/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Moonwell").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the pages' own routes
// (scripts/verify/fixtures/moonwell-flows.json): each account's timeline
// (every row carries its oracle price at its block, server migs 195 and 325),
// the live read from /api/chain/moonwell{,-base}/position, and each market's
// daily price from the shared store (/api/prices/daily):
//
//   base-closed-eight-markets  0x947d…c441: eight markets, every borrow repaid
//                              in full and everything withdrawn
//   base-open-liquidated       0x499a…a278: open on four markets (70k USDC
//                              supplied; WETH, wstETH and AERO owed),
//                              liquidated twice
//   base-liquidated-received   0x2214…e190: liquidated seven times, one
//                              transaction liquidating it twice on two
//                              collaterals, mTokens received by transfer
//   base-liquidated-sent       0x53c8…0699: liquidated nine times, mTokens
//                              sent to another wallet
//   eth-liquidated-closed      0x9323…ef90: liquidated once on Ethereum, then
//                              repaid in full and withdrew everything
//   eth-open-interest          0x33a7…3474: open on Ethereum, USDC and USDT
//                              owed with no repayment
//
// Held: the replay meets every row's recorded balances and every act its
// row's own amount (to the mToken's flooring); no interest is
// negative; a liquidation's repay is the liquidator's RepayBorrow row and its
// seizure the two transfers; at every event day, every day between and the
// live stop, each side's printed lines add to its printed total; each event
// card's sum is exact, its token lines add to the balance at the printed
// decimals, its ledger adds in tokens and in dollars, and its figure at each
// day's last event is the bars' that day; the daily line's points are the
// bars' figures; a quiet day takes the store's price, and without the store
// the last event's; and between events a balance grows by its market's index.
//
//   npx tsx --test scripts/verify/verify-moonwell-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent, MoonwellContext } from "@/lib/shared/types/event-shape";
import {
  CT,
  ctokenEventStates,
  ctokenFlowReplay,
  ctokenFlowTimeline,
  ctokenFocusEvents,
  ctokenLegSign,
  ctokenPricing,
  isCTokenSupplyBucket,
  type CTokenFlowOptions,
  type CTokenLiveMarket,
} from "@/lib/shared/ctoken-flows";
import { moonwellFlowRows, moonwellSeriesKey } from "@/lib/moonwell/flows";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import { dailyPricesFromAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { assetTokenSum, assetTokenSumFor, eventAssetSum, eventCum, eventSideSumByAsset } from "@/lib/shared/flow-focus";
import { assetLedgers, ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";

interface ChainMarket {
  market: string;
  supplyUnderlying: number;
  borrowUnderlying: number;
  exchangeRate: number;
  priceUsd: number | null;
  supplyApr: number | null;
  borrowApr: number | null;
}
interface Fixture {
  name: string;
  deployment: "base" | "eth";
  wallet: string;
  events: BaseActivityEvent[];
  chain: { blockNumber: number; markets: ChainMarket[]; chainStale: boolean };
  daily: DailyAnswer;
}

const FIX = join(__dirname, "fixtures", "moonwell-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
/** 1 Oct 2026, 20:12 UTC: when the live reads were taken. */
const NOW = 1_790_885_540;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);

const mtokenOf = (f: Fixture) => (m: string) =>
  f.deployment === "eth" ? (MOONWELL_MARKET_BY_KEY[m]?.mtoken ?? m) : m.toLowerCase();
const rows = (f: Fixture) => moonwellFlowRows(f.events, mtokenOf(f));
function live(f: Fixture): Record<string, CTokenLiveMarket> {
  const out: Record<string, CTokenLiveMarket> = {};
  for (const m of f.chain.markets)
    out[m.market] = {
      supply: m.supplyUnderlying,
      debt: m.borrowUnderlying,
      exchangeRate: m.exchangeRate > 0 ? m.exchangeRate : null,
      price: m.priceUsd,
      supplyApr: m.supplyApr,
      borrowApr: m.borrowApr,
    };
  return out;
}
/** Each market's daily store prices, as the hook keys them. */
function daily(f: Fixture): Record<string, [number, number][]> {
  const byKey = dailyPricesFromAnswer(f.daily);
  const out: Record<string, [number, number][]> = {};
  for (const m of new Set(rows(f).map((r) => r.market))) {
    const obs = byKey[moonwellSeriesKey(mtokenOf(f)(m))];
    if (obs) out[m] = obs;
  }
  return out;
}
const opts = (f: Fixture, store = true): CTokenFlowOptions => ({
  vocab: { brand: "Moonwell", receipt: "mToken" },
  now: NOW,
  live: live(f),
  ...(store ? { dailyPrices: daily(f) } : {}),
});
function model(f: Fixture, store = true): FlowModel {
  const t = ctokenFlowTimeline(rows(f), opts(f, store));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const dataOf = (e: BaseActivityEvent) => (e.context as { data: MoonwellContext }).data;
/** The underlying's base unit for a row: its amount over its raw amount. */
const unitOf = (f: Fixture, id: string) => {
  const e = f.events.find((x) => x.id === id);
  const d = e ? dataOf(e) : null;
  const raw = Number(d?.raw?.amount);
  const human = Number(d?.assetsDelta);
  return raw > 0 && human !== 0 ? Math.abs(human / raw) : 1e-6;
};

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "base-closed-eight-markets",
    "base-open-liquidated",
    "base-liquidated-received",
    "base-liquidated-sent",
    "eth-liquidated-closed",
    "eth-open-interest",
  ]);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's recorded balances, and every act its row's amount`, () => {
    const f = fx(name);
    const rp = ctokenFlowReplay(rows(f), opts(f));
    assert.equal(rp.replayed.length, f.events.length, "every row");
    const supply = new Map<string, number>();
    const debt = new Map<string, number>();
    for (const r of rp.replayed) {
      const m = r.ev.market;
      for (const l of r.legs) {
        const into = isCTokenSupplyBucket(l.bucket) ? supply : debt;
        into.set(m, (into.get(m) ?? 0) + ctokenLegSign(l.bucket) * l.amount);
        if (l.bucket === CT.earned || l.bucket === CT.accrued)
          assert.ok(l.amount > -1e-6, `${name} ${r.ev.id}: interest ${l.amount}`);
      }
      if (r.ev.supplyAfter != null)
        assert.ok(near(supply.get(m) ?? 0, r.ev.supplyAfter), `${name} ${r.ev.id}: supply ${supply.get(m)}`);
      if (r.ev.debtAfter != null)
        assert.ok(near(debt.get(m) ?? 0, r.ev.debtAfter), `${name} ${r.ev.id}: debt ${debt.get(m)}`);
      // The act is the row's own amount, to the mToken's flooring: the supply
      // is mTokens × the rate floored, so a mint or redeem lands within two
      // base units of the underlying, or two mToken wei at the rate.
      const act = r.legs.find((l) => l.bucket !== CT.earned && l.bucket !== CT.accrued);
      if (act && r.ev.amount != null && ["mint", "redeem", "borrow", "repay", "liquidation"].includes(r.ev.kind))
        assert.ok(
          Math.abs(act.amount - r.ev.amount) <=
            Math.max(
              2.5 * unitOf(f, r.ev.id),
              2e-8 * (r.ev.exchangeRate ?? 0),
              r.ev.amount * 1e-9,
              // A double's rounding on the balances the act is the gap of.
              1e-14 * Math.max(r.ev.supplyBefore ?? 0, r.ev.debtBefore ?? 0),
            ),
          `${name} ${r.ev.id}: act ${act.amount} vs ${r.ev.amount}`,
        );
    }
    // Every row with a flow is priced at its own block.
    assert.equal(ctokenPricing(rp).nearest, 0, `${name}: no row takes a neighbour's price`);
  });
}

test("base-closed-eight-markets: every borrow repaid in full, everything withdrawn", () => {
  const f = fx("base-closed-eight-markets");
  const t = ctokenFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const end = stateAt(m, m.liveStop);
  assert.ok(end.collateral.now < 0.01, `nothing held: ${end.collateral.now}`);
  assert.ok(end.debt.now < 0.01, `nothing owed: ${end.debt.now}`);
  const keys = t.buckets.map((b) => b.key);
  assert.ok(keys.includes(CT.accrued) && keys.includes(CT.earned), "interest on both sides");
  assert.ok(!keys.includes(CT.liquidated) && !keys.includes(CT.seized), "never liquidated");
  const last = Math.max(...f.events.map((e) => e.timestamp));
  assert.equal(t.today, Math.floor(last / DAY) + 1, "the slider stops the day after the last event");
});

for (const name of [
  "base-open-liquidated",
  "base-liquidated-received",
  "base-liquidated-sent",
  "eth-liquidated-closed",
]) {
  test(`${name}: each liquidation's repay is the liquidator's row, its seizure the two transfers`, () => {
    const f = fx(name);
    const rp = ctokenFlowReplay(rows(f), opts(f));
    const liqRows = f.events.filter((e) => dataOf(e).eventType === "liquidation").length;
    const repaidBy = rp.replayed.filter((r) => r.legs.some((l) => l.bucket === CT.liquidated));
    assert.equal(repaidBy.length, liqRows, `${name}: one Repaid by liquidators per liquidation`);
    for (const r of repaidBy) assert.equal(r.ev.kind, "liquidation");
    // The liquidation row states no balance and moves nothing.
    for (const r of rp.replayed)
      if (r.ev.kind === "liquidation" && r.ev.debtAfter == null) assert.equal(r.legs.length, 0, r.ev.id);
    const seized = rp.replayed.filter((r) => r.legs.some((l) => l.bucket === CT.seized));
    assert.deepEqual(
      [...new Set(seized.map((r) => r.ev.kind))].sort(),
      ["seize_liquidator", "seize_protocol"],
      "the liquidator's and the protocol's",
    );
    // A protocol share each (one of a single mToken wei moves no underlying).
    assert.equal(rp.replayed.filter((r) => r.ev.kind === "seize_protocol").length, liqRows, "a protocol share each");
    const t = ctokenFlowTimeline(rows(f), opts(f))!;
    for (const k of [CT.seized, CT.liquidated])
      assert.equal(t.buckets.find((b) => b.key === k)?.link, "liquidation", `${k} linked`);
  });
}

test("base-liquidated-received: one transaction liquidating twice books each repay and each seizure", () => {
  const f = fx("base-liquidated-received");
  const rp = ctokenFlowReplay(rows(f), opts(f));
  const tx = rp.replayed.filter((r) => r.ev.block === 50_418_178);
  const kinds = tx.map((r) => `${r.ev.kind}:${r.ev.symbol}`);
  assert.deepEqual(kinds, [
    "transfer_in:cbBTC",
    "liquidation:cbBTC",
    "seize_liquidator:cbBTC",
    "seize_protocol:cbBTC",
    "liquidation:cbBTC",
    "liquidation:cbBTC",
    "seize_liquidator:USDC",
    "seize_protocol:USDC",
    "liquidation:cbBTC",
  ]);
  const by = (k: string) => rp.replayed.flatMap((r) => r.legs).filter((l) => l.bucket === k);
  assert.equal(by(CT.received).length, 1, "Received by transfer");
});

test("base-liquidated-sent: mTokens sent to another wallet are a line of their own", () => {
  const f = fx("base-liquidated-sent");
  const t = ctokenFlowTimeline(rows(f), opts(f))!;
  assert.ok(t.buckets.some((b) => b.key === CT.sent && b.label === "mTokens sent"));
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
    const rp = ctokenFlowReplay(rows(f), opts(f));
    const focus = ctokenFocusEvents(rp);
    const states = ctokenEventStates(rp, opts(f));
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
    const t = ctokenFlowTimeline(rows(f), opts(f))!;
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
  for (const name of ["base-open-liquidated", "eth-open-interest"]) {
    const f = fx(name);
    const store = daily(f);
    const t = ctokenFlowTimeline(rows(f), opts(f))!;
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
    const carried = ctokenFlowTimeline(rows(f), opts(f, false))!;
    assert.ok(buildFlowModel(carried), `${name}: carried`);
    assert.ok(carried.seriesCarry, "carries");
  }
});

test("open positions: between events each debt grows by its market's index, and today is the live read", () => {
  let checked = 0;
  for (const name of ["base-open-liquidated", "eth-open-interest"]) {
    const f = fx(name);
    const t = ctokenFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const rp = ctokenFlowReplay(rows(f), opts(f));
    const lastDebt = new Map<string, (typeof rp.replayed)[number]>();
    for (const r of rp.replayed) if (r.ev.debtAfter != null) lastDebt.set(r.ev.market, r);
    const startDay = m.start / 86_400_000;
    for (const [market, r] of lastDebt) {
      const l = f.chain.markets.find((x) => x.market === market);
      if (!l || !(r.debt > 0) || !(l.borrowUnderlying > r.debt)) continue;
      // Halfway from the last row to today: more than the row, less than now.
      const day = Math.floor((r.ev.ts + NOW) / 2 / DAY) - startDay;
      const owed = m.heldAt[day].find((h) => h.side === "debt" && h.symbol === r.ev.symbol);
      assert.ok(owed?.grown, `${name} ${market}: grown by the index`);
      assert.ok(owed!.amount! > r.debt && owed!.amount! < l.borrowUnderlying, `${name} ${market} ${owed!.amount}`);
      checked++;
    }
    for (const h of m.liveHeld.filter((x) => x.side === "debt")) {
      const l = f.chain.markets.find(
        (x) => x.borrowUnderlying > 0 && Math.abs(x.borrowUnderlying - (h.amount ?? 0)) < 1e-9,
      );
      assert.ok(l, `${name} ${h.symbol}: the live borrow balance`);
    }
  }
  assert.ok(checked > 0, "an open borrow");
});
