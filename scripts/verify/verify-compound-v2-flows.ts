// verify-compound-v2-flows — a Compound V2 account's Lifetime flows
// (lib/shared/ctoken-flows.ts, lib/compound-v2/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Compound V2").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the page's own routes
// (scripts/verify/fixtures/compound-v2-flows.json): each account's timeline,
// the oracle price at each row's block from /api/chain/compound-v2/prices-at
// (a liquidation in the oracle's USD years carries its own), and the live read
// from /api/chain/compound-v2/position:
//
//   closed-repaid-transfers    0x1e43…31d7: six markets, three borrowed and
//                              repaid in full, everything withdrawn; cTokens
//                              received by transfer (a migration in)
//   open-interest              0x6217…9a42: seven markets, DAI owed since
//                              Aug 2020 and USDC since May 2022 (54,378 DAI
//                              then, 76,210 now), so years of interest
//                              between the last rows and today
//   liquidated-protocol-share  0x1ef0…d758: borrowed, liquidated with the
//                              protocol's seize share burned
//   liquidator                 0x0c9d…3f87: took other borrowers' cTokens as a
//                              liquidator, then redeemed them
//   eth-era-transfer-open      0x0cea…ee39: opened in Sep 2019 by a cToken
//                              transfer in, later sent some out, priced in
//                              the oracle's ETH years
//   eth-era-liquidated         0x04ea…29be: liquidated twice in 2019
//
// Held: the replay meets every row's recorded balances and every act its
// row's own amount; no interest is negative; at every event day, every day
// between and the live stop, each side's printed lines add to its printed
// total; each event card's sum is exact, its token lines add to the balance
// at the printed decimals, its ledger adds in tokens and in dollars, and its
// figure at each day's last event is the bars' that day; the daily line's
// points are the bars' figures; and between events a balance grows by its
// market's index.
//
// Stored prices (scripts/verify/fixtures/compound-stored-prices.json): what
// rails-server stores for each fixture's pairs (mig 372,
// /api/compound-v2/prices-at) turns into the archive read's dollars to the
// bit, the ETH years and a liquidation's seeded legs included, and a panel
// read from them, with the pairs not stored from the archive, is the archive
// panel. The daily store's ETH-year days take the same day's USDC price.
//
//   npx tsx --test scripts/verify/verify-compound-v2-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  CT,
  ctokenEventStates,
  ctokenFlowReplay,
  ctokenFlowTimeline,
  ctokenFocusEvents,
  ctokenLegSign,
  isCTokenSupplyBucket,
  type CTokenFlowOptions,
  type CTokenLiveMarket,
} from "@/lib/shared/ctoken-flows";
import { compoundV2FlowRows, compoundV2RowPrices } from "@/lib/compound-v2/flows";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { assetTokenSum, assetTokenSumFor, eventAssetSum, eventCum, eventSideSumByAsset } from "@/lib/shared/flow-focus";
import { assetLedgers, ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import {
  compoundV2DailyPrices,
  compoundV2SeriesKey,
  storedV2Prices,
  type StoredV2Answer,
} from "@/lib/compound-v2/at-block-prices";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { rawToNum } from "@/lib/compound-v2/liquidation-values";

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
  wallet: string;
  events: BaseActivityEvent[];
  prices: Record<string, number>;
  chain: { blockNumber: number; markets: ChainMarket[]; chainStale: boolean };
}

const FIX = join(__dirname, "fixtures", "compound-v2-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
/** 1 Oct 2026, 19:40 UTC: when the live reads were taken. */
const NOW = 1_790_883_600;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);

function rows(f: Fixture) {
  const prices = new Map([...compoundV2RowPrices(f.events), ...Object.entries(f.prices)]);
  return compoundV2FlowRows(f.events, prices);
}
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
const opts = (f: Fixture): CTokenFlowOptions => ({
  vocab: { brand: "Compound", receipt: "cToken" },
  now: NOW,
  live: live(f),
});
function model(f: Fixture): FlowModel {
  const t = ctokenFlowTimeline(rows(f), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid-transfers",
    "open-interest",
    "liquidated-protocol-share",
    "liquidator",
    "eth-era-transfer-open",
    "eth-era-liquidated",
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
        // Interest is never negative (a base unit of the exchange rate's
        // flooring aside).
        if (l.bucket === CT.earned || l.bucket === CT.accrued)
          assert.ok(l.amount > -1e-6, `${name} ${r.ev.id}: interest ${l.amount}`);
      }
      if (r.ev.supplyAfter != null)
        assert.ok(near(supply.get(m) ?? 0, r.ev.supplyAfter), `${name} ${r.ev.id}: supply ${supply.get(m)}`);
      if (r.ev.debtAfter != null)
        assert.ok(near(debt.get(m) ?? 0, r.ev.debtAfter), `${name} ${r.ev.id}: debt ${debt.get(m)}`);
      // The act is the row's own amount, to the exchange rate's flooring.
      const act = r.legs.find((l) => l.bucket !== CT.earned && l.bucket !== CT.accrued);
      if (act && r.ev.amount != null && ["mint", "redeem", "borrow", "repay", "liquidation"].includes(r.ev.kind))
        assert.ok(
          Math.abs(act.amount - r.ev.amount) <= Math.max(1e-6, r.ev.amount * 1e-9),
          `${name} ${r.ev.id}: act ${act.amount} vs ${r.ev.amount}`,
        );
    }
  });
}

test("closed-repaid-transfers: every borrow repaid in full, everything withdrawn, the transfers in on their own line", () => {
  const f = fx("closed-repaid-transfers");
  const t = ctokenFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const end = stateAt(m, m.liveStop);
  assert.equal(end.collateral.now, 0, "nothing held");
  assert.equal(end.debt.now, 0, "nothing owed");
  const keys = t.buckets.map((b) => b.key);
  assert.ok(keys.includes(CT.received) && !keys.includes(CT.sent), "received, nothing sent");
  assert.ok(keys.includes(CT.accrued) && keys.includes(CT.earned), "interest on both sides");
  // Closed: the slider stops the day after the last event.
  const last = Math.max(...f.events.map((e) => e.timestamp));
  assert.equal(t.today, Math.floor(last / DAY) + 1);
});

test("liquidated-protocol-share: the seizure's both legs are Seized in liquidations, the debt Repaid by liquidators", () => {
  const f = fx("liquidated-protocol-share");
  const rp = ctokenFlowReplay(rows(f), opts(f));
  const legs = rp.replayed.flatMap((r) => r.legs.map((l) => ({ ...l, kind: r.ev.kind, own: r.ownPrice })));
  const seized = legs.filter((l) => l.bucket === CT.seized);
  assert.deepEqual(
    seized.map((l) => l.kind).sort(),
    ["seize_liquidator", "seize_protocol"],
    "the liquidator's and the protocol's",
  );
  assert.equal(legs.filter((l) => l.bucket === CT.liquidated).length, 1);
  // Priced by the liquidation row's own oracle legs (mig 151).
  for (const r of rp.replayed) if (r.ev.kind !== "mint" && r.ev.kind !== "borrow") assert.ok(r.ownPrice, r.ev.id);
  const t = ctokenFlowTimeline(rows(f), opts(f))!;
  for (const k of [CT.seized, CT.liquidated])
    assert.equal(t.buckets.find((b) => b.key === k)?.link, "liquidation", `${k} linked`);
});

test("liquidator: the cTokens it took are Seized as liquidator", () => {
  const f = fx("liquidator");
  const rp = ctokenFlowReplay(rows(f), opts(f));
  const taken = rp.replayed.flatMap((r) => r.legs).filter((l) => l.bucket === CT.seizedIn);
  assert.equal(taken.length, 4);
  assert.equal(rp.borrower, false, "one bar");
  const t = ctokenFlowTimeline(rows(f), opts(f))!;
  assert.ok(!t.buckets.some((b) => b.side === "debt"), "no debt bar");
});

test("eth-era-transfer-open: cTokens received and sent by transfer are lines of their own", () => {
  const f = fx("eth-era-transfer-open");
  const rp = ctokenFlowReplay(rows(f), opts(f));
  const by = (k: string) => rp.replayed.flatMap((r) => r.legs).filter((l) => l.bucket === k);
  assert.equal(by(CT.received).length, 1);
  assert.equal(by(CT.sent).length, 1);
  // The transfer in opened the account: 97.000047 ETH at the block's rate.
  assert.ok(Math.abs(by(CT.received)[0].amount - 97.000047152588402311) < 1e-9);
});

test("the oracle's ETH years are turned into dollars at the block", () => {
  for (const name of ["eth-era-transfer-open", "eth-era-liquidated"]) {
    const f = fx(name);
    const rp = ctokenFlowReplay(rows(f), opts(f));
    for (const r of rp.replayed) {
      assert.ok(r.ev.block < 10_678_764, `${name}: before the switch`);
      assert.ok(r.ownPrice, `${name} ${r.ev.id}: priced at its block`);
      // ETH sold between $100 and $400 in 2019; the dollar stables at about $1.
      if (r.ev.symbol === "ETH") assert.ok(r.price > 100 && r.price < 400, `${name} ETH ${r.price}`);
      if (["SAI", "DAI", "USDC"].includes(r.ev.symbol))
        assert.ok(Math.abs(r.price - 1) < 0.1, `${r.ev.symbol} ${r.price}`);
    }
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

test("open-interest: between events each debt grows by its market's index, and today is the live read", () => {
  const f = fx("open-interest");
  const t = ctokenFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const rp = ctokenFlowReplay(rows(f), opts(f));
  // Each open borrow: a day a year after its last row owes more than that row
  // recorded and less than the live read.
  const lastDebt = new Map<string, (typeof rp.replayed)[number]>();
  for (const r of rp.replayed) if (r.ev.debtAfter != null) lastDebt.set(r.ev.market, r);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (const [market, r] of lastDebt) {
    const l = f.chain.markets.find((x) => x.market === market);
    if (!l || !(r.debt > 0) || !(l.borrowUnderlying > 0)) continue;
    const day = Math.floor(r.ev.ts / DAY) + 365 - startDay;
    const owed = m.heldAt[day].find((h) => h.side === "debt" && h.symbol === r.ev.symbol);
    assert.ok(owed?.grown, `${market}: grown by the index`);
    assert.ok(owed!.amount! > r.debt && owed!.amount! < l.borrowUnderlying, `${market} ${owed!.amount}`);
    checked++;
  }
  assert.ok(checked > 0, "an open borrow");
  // Today: the live read.
  const live = m.liveHeld.filter((h) => h.side === "debt");
  for (const h of live) {
    const l = f.chain.markets.find(
      (x) => x.borrowUnderlying > 0 && Math.abs(x.borrowUnderlying - (h.amount ?? 0)) < 1e-9,
    );
    assert.ok(l, `${h.symbol}: the live borrow balance`);
  }
});

// ── Stored prices (rails-server mig 372) and the daily store ──────────────────

const STORED = JSON.parse(readFileSync(join(__dirname, "fixtures", "compound-stored-prices.json"), "utf8")) as {
  v2: Record<string, StoredV2Answer>;
};

for (const name of NAMES) {
  test(`${name}: the stored prices are the archive read's, to the bit`, () => {
    const f = fx(name);
    const stored = STORED.v2[name];
    assert.ok(stored, `${name}: stored answer`);
    assert.deepEqual(stored.missing, [], `${name}: every pair stored`);
    const usd = storedV2Prices(stored);
    for (const [pair, archive] of Object.entries(f.prices)) assert.equal(usd.get(pair), archive, `${name} ${pair}`);
  });

  test(`${name}: a panel read from the stored prices, the rest from the archive, is the archive panel`, () => {
    const f = fx(name);
    const pairs = Object.keys(f.prices).sort();
    const stored = storedV2Prices(STORED.v2[name]);
    // Every other pair as if not stored yet: those come from the archive.
    const mixed = new Map(pairs.map((p, i) => [p, i % 2 === 1 ? f.prices[p] : stored.get(p)!] as [string, number]));
    const fromStore = ctokenFlowTimeline(
      compoundV2FlowRows(f.events, new Map([...compoundV2RowPrices(f.events), ...mixed])),
      opts(f),
    );
    assert.deepEqual(fromStore, ctokenFlowTimeline(rows(f), opts(f)), `${name}: the same timeline`);
  });
}

test("the daily store's ETH-year days take the same day's USDC price, as an event's do", () => {
  const ceth = compoundV2SeriesKey(COMPOUND_V2_MARKET_BY_KEY.eth.ctoken);
  const cusdc = compoundV2SeriesKey(COMPOUND_V2_MARKET_BY_KEY.usdc.ctoken);
  const body = {
    series: {
      // The series' unit is its latest row's; the ETH years carry theirs.
      [ceth]: {
        unit: "usd",
        scale: 18,
        obs: [
          [18_000, "1000000000000000000", "8000000", "eth", 18],
          [18_001, "1000000000000000000", "8006000", "eth", 18],
          [18_500, "380000000000000000000", "10700000"],
        ] as [number, string, string, string?, number?][],
      },
      [cusdc]: {
        unit: "usd",
        scale: 30,
        obs: [[18_000, "3500000000000000000000000000", "8000000", "eth", 30]] as [
          number,
          string,
          string,
          string?,
          number?,
        ][],
      },
    },
  };
  const out = compoundV2DailyPrices(body, ["eth"]);
  assert.deepEqual(
    out.eth,
    [
      [
        18_000,
        rawToNum(BigInt("1000000000000000000"), 18) * (1 / rawToNum(BigInt("3500000000000000000000000000"), 30)),
      ],
      [18_500, 380],
    ],
    "the ETH day in dollars, the day with no USDC price left out, the USD day as it is",
  );
});

test("open-interest: a quiet day takes the daily store's price, an event's day the row's", () => {
  const f = fx("open-interest");
  const evs = rows(f);
  const market = evs[evs.length - 1].market;
  const days = new Set(evs.filter((r) => r.market === market).map((r) => Math.floor(r.ts / DAY)));
  const first = Math.min(...days);
  let quiet = first + 1;
  while (days.has(quiet)) quiet++;
  const carried = ctokenFlowTimeline(evs, opts(f))!;
  const stored = ctokenFlowTimeline(evs, {
    ...opts(f),
    dailyPrices: {
      [market]: [
        [first, 1],
        [quiet, 4_321],
      ],
    },
  })!;
  const at = (t: typeof stored, d: number) => t.dailyPrices![market].find(([x]) => x === d)?.[1];
  assert.equal(at(stored, quiet), 4_321, "a quiet day takes the store's price");
  assert.equal(at(carried, quiet), undefined, "without the store the day carries");
  assert.equal(at(stored, first), at(carried, first), "an event's day keeps the row's price");
});
