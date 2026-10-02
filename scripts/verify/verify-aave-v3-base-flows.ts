// verify-aave-v3-base-flows — an Aave V3 Pool account's Lifetime flows on
// Base: Aave V3 on Base and Seamless (lib/aave-v3-base/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Aave V3 on Base and Seamless").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 2 Oct 2026 from the pages' own routes
// (scripts/verify/fixtures/aave-v3-base-flows.json): each account's flat
// history (/api/chain/{aave-v3-base,seamless}/timeline, every row's balances
// as the aToken and the debt token held them), the Pool read
// (/position), the oracle now (/oracle-prices) and each reserve's daily price
// from the shared store (/api/prices/daily):
//
//   aave-closed-swaps        0xe4da…6fc9: closed; collateral and debt swaps,
//                            aTokens received and sent, a repay with aTokens
//   aave-open-interest       0xfa44…28de: open, 149 borrows; aTokens sent
//                            and received
//   aave-liquidated-atokens  0x76dc…61df: liquidated three times, each
//                            liquidator taking aTokens, each fee to the treasury
//   aave-liquidated-six      0xed16…b72d: liquidated six times, aTokens
//                            received, a repay with aTokens
//   aave-liquidated-swaps    0xe908…4f81: liquidated; a collateral swap and a
//                            repay with collateral
//   aave-written-off         0x0f26…b6f7: liquidated, then the Pool wrote off
//                            the WETH debt left (DeficitCreated, not read)
//   seamless-liquidated      0xfa1c…7ae8: liquidated eight times
//   seamless-closed          0xe9c2…5360: supplied and withdrew everything
//   seamless-open-sent       0x9ecb…a05e: open; aTokens sent
//
// Held: at every transaction the replay meets every balance its rows record,
// each act within the Pool's rounding of a scaled balance (three base units
// of the token per row); no interest is negative; a liquidation paid in
// aTokens counts its seizure once and its treasury fee as Liquidated; at every
// day and the live stop each side's printed lines add to its printed total;
// each event card's sum is exact and its token lines add to the balance; the
// daily line's points are the bars' figures; a quiet day takes the store's
// price, and without the store the last event's; between events a balance
// grows by its reserve's index and today is the Pool's; debt the Pool wrote
// off is the Written off line today.
//
//   npx tsx --test scripts/verify/verify-aave-v3-base-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  INTEREST_ACCRUED,
  INTEREST_EARNED,
  aaveBaseFlowTimeline,
  aaveBaseFocusEvents,
  aaveBaseLegSign,
  aaveBaseReplay,
  isAaveBaseInterest,
  type AaveBaseFlowOptions,
  type AaveBaseLiveReserve,
} from "@/lib/aave-v3-base/flows";
import { AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK } from "@/lib/aave-v3-base/write-off-gap";
import { dailyPricesFromAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { buildFlowModel, stateAt, type FlowModel, type FlowSide } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { assetTokenSumFor, eventAssetSum, eventCum, type AssetBalance } from "@/lib/shared/flow-focus";

interface Fixture {
  name: string;
  family: "aave-v3-base" | "seamless";
  wallet: string;
  events: BaseActivityEvent[];
  chain: {
    blockNumber: number;
    chainStale: boolean;
    reserves: { address: string; symbol: string; decimals: number; supplyBalanceRaw: string; debtBalanceRaw: string }[];
  };
  prices: Record<string, number>;
  daily: DailyAnswer;
}

const FIX = join(__dirname, "fixtures", "aave-v3-base-flows.json");
const FILE = JSON.parse(readFileSync(FIX, "utf8")) as { readAt: number; fixtures: Fixture[] };
const ALL = FILE.fixtures;
const NOW = FILE.readAt;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;

function live(f: Fixture): Record<string, AaveBaseLiveReserve> {
  const out: Record<string, AaveBaseLiveReserve> = {};
  for (const r of f.chain.reserves)
    out[r.address.toLowerCase()] = {
      supply: Number(r.supplyBalanceRaw) / 10 ** r.decimals,
      debt: Number(r.debtBalanceRaw) / 10 ** r.decimals,
    };
  return out;
}
/** Each reserve's daily store prices, as the hook keys them. */
function daily(f: Fixture): Record<string, [number, number][]> {
  const out: Record<string, [number, number][]> = {};
  for (const [key, obs] of Object.entries(dailyPricesFromAnswer(f.daily))) out[key.slice(key.indexOf(":") + 1)] = obs;
  return out;
}
const opts = (f: Fixture, store = true): AaveBaseFlowOptions => ({
  now: NOW,
  live: live(f),
  todayPrices: Object.fromEntries(Object.entries(f.prices).map(([a, p]) => [a.toLowerCase(), p])),
  brand: f.family === "seamless" ? "Seamless" : "Aave",
  writeOffFrom: f.family === "seamless" ? null : AAVE_V3_BASE_FIRST_WRITE_OFF_BLOCK,
  ...(store ? { dailyPrices: daily(f) } : {}),
});
const replay = (f: Fixture, store = true) => aaveBaseReplay(f.events, opts(f, store));
function model(f: Fixture, store = true): FlowModel {
  const t = aaveBaseFlowTimeline(replay(f, store), opts(f, store));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
/** Each reserve's base unit. */
function units(f: Fixture): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of f.events)
    for (const fl of e.flows)
      if (fl.token && fl.tokenDecimals != null) out.set(fl.token.toLowerCase(), 10 ** -fl.tokenDecimals);
  for (const r of f.chain.reserves) out.set(r.address.toLowerCase(), 10 ** -r.decimals);
  return out;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const eventType = (e: BaseActivityEvent) => (e.context as { data: { eventType: string } }).data.eventType;

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "aave-closed-swaps",
    "aave-open-interest",
    "aave-liquidated-atokens",
    "aave-liquidated-six",
    "aave-liquidated-swaps",
    "aave-written-off",
    "seamless-liquidated",
    "seamless-closed",
    "seamless-open-sent",
  ]);
});

for (const name of NAMES) {
  test(`${name}: at every transaction the replay meets the recorded balances, each act within the Pool's rounding`, () => {
    const f = fx(name);
    const rp = replay(f);
    assert.equal(rp.replayed.length, f.events.length, "every row");
    const unit = units(f);
    const running = new Map<string, number>();
    let i = 0;
    while (i < rp.replayed.length) {
      const tx = rp.replayed[i].tx;
      let j = i;
      while (j + 1 < rp.replayed.length && rp.replayed[j + 1].tx === tx) j++;
      const legs = new Map<string, number>();
      const rows = new Map<string, number>();
      const after = new Map<string, number>();
      for (let k = i; k <= j; k++) {
        const r = rp.replayed[k];
        for (const l of r.legs) {
          const key = `${l.side}:${l.asset}`;
          legs.set(key, (legs.get(key) ?? 0) + aaveBaseLegSign(l.bucket) * l.amount);
          if (isAaveBaseInterest(l.bucket)) assert.ok(l.amount > 0, `${name} ${r.ev.id}: interest ${l.amount}`);
        }
        for (const s of r.stated) rows.set(`${s.side}:${s.asset}`, (rows.get(`${s.side}:${s.asset}`) ?? 0) + 1);
        for (const b of r.after) after.set(`${b.side}:${b.asset}`, b.amount);
      }
      for (const [key, a] of after) {
        const b = running.get(key) ?? 0;
        const l = legs.get(key) ?? 0;
        const asset = key.slice(key.indexOf(":") + 1);
        const u = unit.get(asset) ?? 1e-18;
        const gap = Math.abs(a - (b + l));
        // Three base units a row (measured: two at most), or a double's
        // rounding on an 18-decimal balance.
        const scale = Math.max(a, b, Math.abs(l));
        const allowed = Math.max(3 * u * Math.max(1, rows.get(key) ?? 0), 1e-10 * scale);
        assert.ok(gap <= allowed, `${name} ${tx} ${key}: before ${b} + legs ${l} = ${b + l} vs recorded ${a}`);
        running.set(key, a);
      }
      i = j + 1;
    }
  });
}

test("aave-liquidated-atokens: a liquidation paid in aTokens counts its seizure once, its fee as Liquidated", () => {
  const f = fx("aave-liquidated-atokens");
  const rp = replay(f);
  const liqTxs = new Set(rp.replayed.filter((r) => eventType(r.ev) === "liquidation").map((r) => r.tx));
  assert.equal(liqTxs.size, 3, "three liquidations");
  for (const tx of liqTxs) {
    const rows = rp.replayed.filter((r) => r.tx === tx);
    const seizure = rows.filter((r) => r.seizureTransfer);
    const fee = rows.filter((r) => r.treasuryFee);
    assert.equal(seizure.length, 1, `${tx}: one transfer to the liquidator`);
    assert.equal(
      seizure[0].legs.filter((l) => !isAaveBaseInterest(l.bucket)).length,
      0,
      `${tx}: the seizure's transfer adds no leg`,
    );
    assert.equal(fee.length, 1, `${tx}: one fee to the treasury`);
    assert.deepEqual(
      fee[0].legs.map((l) => l.bucket),
      ["liquidatedCollateral"],
      `${tx}: the fee is Liquidated`,
    );
    const liq = rows.find((r) => eventType(r.ev) === "liquidation")!;
    // The seized collateral is the transfer to the liquidator, to the unit.
    const seized = liq.legs.find((l) => l.bucket === "liquidatedCollateral")!.amount;
    const moved = Number((seizure[0].ev.context as { data: { amount: string } }).data.amount);
    assert.ok(near(seized, moved, 1e-12), `${tx}: seized ${seized} vs transfer ${moved}`);
  }
  const t = aaveBaseFlowTimeline(rp, opts(f))!;
  for (const k of ["liquidatedCollateral", "liquidatedDebt"])
    assert.equal(t.buckets.find((b) => b.key === k)?.link, "liquidation", `${k} linked`);
});

test("seamless-liquidated: eight liquidations, each repaying debt and seizing collateral", () => {
  const rp = replay(fx("seamless-liquidated"));
  const liq = rp.replayed.filter((r) => eventType(r.ev) === "liquidation");
  assert.equal(liq.length, 8);
  for (const r of liq)
    assert.deepEqual(
      r.legs
        .filter((l) => !isAaveBaseInterest(l.bucket))
        .map((l) => l.bucket)
        .sort(),
      ["liquidatedCollateral", "liquidatedDebt"],
    );
});

test("the extra lines: swaps, transfers, repays with aTokens and with collateral", () => {
  const has = (name: string, keys: string[]) => {
    const t = aaveBaseFlowTimeline(replay(fx(name)), opts(fx(name)))!;
    const got = new Set(t.buckets.map((b) => b.key));
    for (const k of keys) assert.ok(got.has(k), `${name}: ${k}`);
  };
  has("aave-closed-swaps", ["swappedIn", "swappedOut", "repaidBySwap", "received", "sent", "usedToRepay"]);
  has("aave-liquidated-swaps", ["soldToRepay", "repaidWithCollateral", "swappedIn", "swappedOut", "usedToRepay"]);
  has("aave-liquidated-six", ["received", "usedToRepay", "liquidatedCollateral", "liquidatedDebt"]);
  has("aave-open-interest", ["sent", "received", INTEREST_EARNED, INTEREST_ACCRUED]);
  has("seamless-open-sent", ["sent"]);
});

for (const name of ["aave-closed-swaps", "seamless-closed"]) {
  test(`${name}: everything repaid and withdrawn, the slider stops the day after the last event`, () => {
    const f = fx(name);
    const t = aaveBaseFlowTimeline(replay(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const end = stateAt(m, m.liveStop);
    assert.ok(end.collateral.now < 0.01, `nothing held: ${end.collateral.now}`);
    assert.ok(end.debt.now < 0.01, `nothing owed: ${end.debt.now}`);
    const last = Math.max(...f.events.map((e) => e.timestamp));
    assert.equal(t.today, Math.floor(last / DAY) + 1);
    assert.ok(
      t.buckets.some((b) => b.key === INTEREST_EARNED),
      "interest earned",
    );
  });
}

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
  test(`${name}: every event card's sum is exact and its token lines add to the balance`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = replay(f);
    const focus = aaveBaseFocusEvents(rp);
    // The balances once each transaction had run, as the Pool states them at
    // its block: the reserves its rows touched as recorded.
    const held = new Map<string, { side: FlowSide; symbol: string; amount: number }>();
    let sums = 0;
    for (let i = 0; i < focus.length; i++) {
      const r = rp.replayed[i];
      for (const b of r.after) held.set(`${b.side}:${b.asset}`, { side: b.side, symbol: b.symbol, amount: b.amount });
      const lastOfTx = i === focus.length - 1 || rp.replayed[i + 1].tx !== r.tx;
      if (!lastOfTx) continue;
      const cum = eventCum(m, focus, focus[i].id);
      assert.ok(cum?.exact, `${name} ${focus[i].id}: the legs add to the day row's move`);
      for (const side of ["collateral", "debt"] as const) {
        const bySym = new Map<string, AssetBalance>();
        for (const h of held.values())
          if (h.side === side && h.amount > 0) {
            const b = bySym.get(h.symbol) ?? { symbol: h.symbol, amount: 0, before: 0, price: null };
            b.amount += h.amount;
            bySym.set(h.symbol, b);
          }
        const balances = [...bySym.values()];
        const sum = eventAssetSum(m, focus, side, cum!, focus[i].id, balances, {
          interestLabel: "Interest since the last event",
          relDust: 1e-9,
        });
        assert.ok(sum, `${name} ${focus[i].id} ${side}: a sum by asset`);
        for (const b of balances) {
          const t = assetTokenSumFor(sum, b.symbol);
          assert.equal(
            t.lines.reduce((a, l) => a + l.units, 0),
            t.total.units,
            `${name} ${focus[i].id} ${side} ${b.symbol}: token lines add`,
          );
          assert.equal(t.total.units, Math.round(b.amount * 10 ** t.decimals), `${name} ${focus[i].id}: the balance`);
          sums++;
        }
      }
    }
    assert.ok(sums > 0);
  });
}

for (const name of NAMES) {
  test(`${name}: the daily line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = aaveBaseFlowTimeline(replay(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const bin = seriesRouteBinFor(t.today! - startDay);
    const series = binSeries(binInputFromTimeline(t)!, bin)!;
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      if (collateral == null && debt == null) continue;
      const st = stateAt(m, to - startDay);
      assert.ok(Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6), `coll ${to}`);
      assert.ok(Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1, st.debt.now * 1e-6), `debt ${to}`);
    }
  });
}

test("a quiet day takes the store's price; without the store, the last event's", () => {
  for (const name of ["aave-open-interest", "seamless-open-sent"]) {
    const f = fx(name);
    const store = daily(f);
    const rp = replay(f);
    const t = aaveBaseFlowTimeline(rp, opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const eventDays = new Set(f.events.map((e) => Math.floor(e.timestamp / DAY)));
    const assetOf = new Map([...rp.symbols].map(([a, s]) => [s, a]));
    let checked = 0;
    for (let stop = 0; stop < m.liveStop && checked < 40; stop++) {
      const day = startDay + stop;
      if (eventDays.has(day)) continue;
      for (const h of m.heldAt[stop]) {
        const p = store[assetOf.get(h.symbol) ?? ""]?.find(([d]) => d === day)?.[1];
        if (p == null || !(h.amount! > 0)) continue;
        assert.ok(near(h.usd! / h.amount!, p, 1e-9), `${name} ${h.symbol} day ${day}: ${h.usd! / h.amount!} vs ${p}`);
        checked++;
      }
    }
    assert.ok(checked > 0, `${name}: a quiet held day`);
    const carried = aaveBaseFlowTimeline(replay(f, false), opts(f, false))!;
    assert.ok(buildFlowModel(carried), `${name}: carried`);
    assert.ok(carried.seriesCarry, "carries");
  }
});

test("open positions: between events a balance grows by its reserve's index, and today is the Pool's", () => {
  let checked = 0;
  for (const name of ["aave-open-interest", "seamless-open-sent"]) {
    const f = fx(name);
    const rp = replay(f);
    const t = aaveBaseFlowTimeline(rp, opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const l = live(f);
    for (const [key, r] of rp.last) {
      const side = key.slice(0, key.indexOf(":")) as FlowSide;
      const asset = key.slice(key.indexOf(":") + 1);
      const now = side === "collateral" ? l[asset]?.supply : l[asset]?.debt;
      if (!(r.amount > 0) || now == null || !(now > r.amount)) continue;
      // Halfway from the last row to today: more than the row, less than now.
      const day = Math.floor((r.ts + NOW) / 2 / DAY) - startDay;
      if (day <= Math.floor(r.ts / DAY) - startDay) continue;
      const h = m.heldAt[day].find((x) => x.side === side && x.symbol === rp.symbols.get(asset));
      assert.ok(h?.grown, `${name} ${key}: grown by the index`);
      assert.equal(h!.grown!.basis, "aave-rows");
      assert.ok(h!.amount! > r.amount && h!.amount! < now, `${name} ${key}: ${r.amount} < ${h!.amount} < ${now}`);
      checked++;
    }
    for (const h of m.liveHeld) {
      const pool = f.chain.reserves.find(
        (x) =>
          x.symbol === h.symbol &&
          near(
            Number(h.side === "collateral" ? x.supplyBalanceRaw : x.debtBalanceRaw) / 10 ** x.decimals,
            h.amount ?? -1,
          ),
      );
      assert.ok(pool, `${name} ${h.side} ${h.symbol}: the Pool's balance today`);
    }
  }
  assert.ok(checked > 0, "an open balance grown between events");
});

test("aave-written-off: the debt the Pool wrote off is the Written off line today", () => {
  const f = fx("aave-written-off");
  const rp = replay(f);
  assert.equal(rp.writtenOff.length, 1);
  assert.equal(rp.writtenOff[0].symbol, "WETH");
  const t = aaveBaseFlowTimeline(rp, opts(f))!;
  assert.ok(t.buckets.some((b) => b.key === "writtenOff"));
  assert.deepEqual(
    t.live.pending?.map((p) => p.bucket),
    ["writtenOff"],
  );
  const m = buildFlowModel(t)!;
  const end = stateAt(m, m.liveStop);
  assert.ok(end.debt.now < 1e-6, `nothing owed: ${end.debt.now}`);
  // Seamless applies no write-off.
  assert.equal(replay(fx("seamless-liquidated")).writtenOff.length, 0);
});
