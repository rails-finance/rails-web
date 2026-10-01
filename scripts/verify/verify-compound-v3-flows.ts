// verify-compound-v3-flows — a Compound V3 (Comet) position's Lifetime flows
// (lib/compound/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Compound V3").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the pages' routes
// (scripts/verify/fixtures/compound-v3-flows.json: /api/compound/timeline on
// Ethereum, /api/chain/compound-base/timeline on Base), with Comet's oracle
// prices at each row's block from /api/chain/compound/prices-at-block:
//
//   usdc-repaid            cUSDCv3 0x78c3…af0a: tBTC and WBTC collateral,
//                          borrowed 17,500 USDC, repaid in full, withdrew all
//   usdc-open-received     cUSDCv3 0xc5cd…cc46: 42.03 WBTC received by
//                          transferAsset, borrowed and repaid 1.89M, now owes
//                          751k USDC with interest
//   usdc-absorbed          cUSDCv3 0xca29…370a: borrowed 40,000 USDC on 27.5
//                          WETH, absorbed on 6 Apr '25 (2,126.08 USDC left
//                          over, lent), then withdrew it with its interest
//   usdc-lender            cUSDCv3 0xe0d1…57c4: a lender, open
//   usdc-lender-transfers  cUSDCv3 0xee04…f28b: lent USDC received by
//                          transfer, sent on in eleven transfers
//   usdt-unlogged          cUSDTv3 0x3704…ca75: 77.02 USDT borrowed to send by
//                          transfer (no event logs it), then absorbed
//   usdt-collateral-sent   cUSDTv3 0x6567…d58f: WETH collateral received and
//                          sent by transferAsset, lent USDT transfers
//   weth-repaid            cWETHv3 0x0090…a4df: an ETH-quoted market, two
//                          borrows of 1,000 WETH on wstETH, both repaid
//   base-usdc-absorbed     Base cUSDCv3 0x7576…06fc: absorbed with three
//                          collateral assets, 113.61 USDC left over
//   base-usdc-lender       Base cUSDCv3 0x3a79…b852: a lender, closed
//
// Held: the replay meets every row's recorded balances (the base to Comet's
// two units of rounding, each collateral asset to the unit); the interest is the
// rows'; an absorb's lines add to its basePaidOut; at every event day,
// every day between and the live stop, each side's printed lines add to its
// printed total; each event card's sum is exact, each asset's token lines add
// to its recorded balance and every ledger adds in tokens and dollars; the
// daily line's points are the bars' figures.
//
// Stored prices (scripts/verify/fixtures/compound-stored-prices.json): what
// rails-server stores for each fixture's blocks (mig 372,
// /api/compound/prices-at) turns into the archive read's dollars to the bit,
// and a panel read from them, with the blocks not stored from the archive,
// is the archive panel. The daily store's price takes the days between
// events, a row's day keeping the row's.
//
//   npx tsx --test scripts/verify/verify-compound-v3-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";
import { marketOf, type CometMarket } from "@/lib/compound/asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import {
  CV3,
  compoundFlowEvents,
  compoundFlowReplay,
  compoundFlowTimeline,
  compoundFocusEvents,
  compoundSideBalances,
  toUnits,
  type CompoundFlowEvent,
  type CompoundFlowOptions,
} from "@/lib/compound/flows";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { assetTokenSum, eventAssetSum, eventCum, eventSideSum, eventSideSumByAsset } from "@/lib/shared/flow-focus";
import { assetLedgers, ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";
import { storedCometPrices, type StoredCometBlock } from "@/lib/compound/at-block-prices";
import { compoundAssets } from "@/lib/compound/flows";

interface Fixture {
  name: string;
  deployment?: "base";
  market: string;
  wallet: string;
  events: unknown[];
  wire: unknown;
  prices: Record<string, Record<string, number>>;
}

const FIX = join(__dirname, "fixtures", "compound-v3-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
/** 1 Oct 2026, 18:00 UTC: after every fixture's last row. */
const NOW = 1_790_877_600;
const DAY = 86_400;

const marketFor = (f: Fixture): CometMarket =>
  f.deployment === "base" ? COMPOUND_BASE_DEPLOYMENT.markets.find((m) => m.key === f.market)! : marketOf(f.market);

function served(f: Fixture): BaseActivityEvent[] {
  const p = rehydrateChainTimelineWire({ events: f.events, ...(f.wire ? { wire: f.wire } : {}) }) as {
    events: BaseActivityEvent[];
  };
  return p.events.filter(isCompoundEvent);
}
function rows(f: Fixture): CompoundFlowEvent[] {
  const m = marketFor(f);
  const prices = new Map(Object.entries(f.prices).map(([b, p]) => [Number(b), p]));
  return compoundFlowEvents(served(f), m.baseToken, m.baseDecimals, prices);
}
function opts(f: Fixture): CompoundFlowOptions {
  const m = marketFor(f);
  return { baseToken: m.baseToken, baseSymbol: m.baseSymbol, baseDecimals: m.baseDecimals, now: NOW, live: null };
}
function model(f: Fixture): FlowModel {
  const t = compoundFlowTimeline(rows(f), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}

const NAMES = ALL.map((f) => f.name);
const OUT = new Set<string>([
  CV3.collOut,
  CV3.withdrawn,
  CV3.sent,
  CV3.seized,
  CV3.repaid,
  CV3.repaidReceived,
  CV3.cleared,
]);
const DEBT = new Set<string>([
  CV3.borrowed,
  CV3.accrued,
  CV3.borrowedSent,
  CV3.repaid,
  CV3.repaidReceived,
  CV3.cleared,
]);

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "usdc-repaid",
    "usdc-open-received",
    "usdc-absorbed",
    "usdc-lender",
    "usdc-lender-transfers",
    "usdt-unlogged",
    "usdt-collateral-sent",
    "weth-repaid",
    "base-usdc-absorbed",
    "base-usdc-lender",
  ]);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's recorded balances`, () => {
    const f = fx(name);
    const m = marketFor(f);
    const unit = 10 ** -m.baseDecimals;
    const rp = compoundFlowReplay(rows(f), opts(f));
    let base = 0;
    const coll = new Map<string, number>();
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        const sign = OUT.has(l.bucket) ? -1 : 1;
        if (l.token === rp.base) base += (DEBT.has(l.bucket) ? -1 : 1) * sign * l.amount;
        else coll.set(l.token, (coll.get(l.token) ?? 0) + sign * l.amount);
      }
      if (r.ev.baseAfter != null)
        assert.ok(
          // Two units of rounding, or float noise on an 18-decimal base.
          Math.abs(base - r.ev.baseAfter) <= Math.max(2.0001 * unit, 1e-9),
          `${name} ${r.ev.id}: base ${base} vs ${r.ev.baseAfter}`,
        );
      if (!r.ev.isBase && r.ev.collAfter != null) {
        const c = coll.get(r.ev.token) ?? 0;
        assert.ok(Math.abs(c - r.ev.collAfter) <= 1e-9 * Math.max(1, r.ev.collAfter), `${name} ${r.ev.id}: ${c}`);
      }
      // Interest is never negative past the rounding.
      for (const l of r.legs)
        if (l.bucket === CV3.accrued || l.bucket === CV3.earned) assert.ok(l.amount > -2.0001 * unit, `${name}`);
    }
  });

  test(`${name}: the interest and the unlogged moves are the rows'`, () => {
    const f = fx(name);
    const m = marketFor(f);
    const rp = compoundFlowReplay(rows(f), opts(f));
    const ev = served(f);
    let rowsInterest = BigInt(0);
    let rowsUnlogged = BigInt(0);
    for (const e of ev) {
      if (!isCompoundEvent(e)) continue;
      rowsInterest += toUnits(e.context.data.baseInterest, m.baseDecimals) ?? BigInt(0);
      rowsUnlogged += toUnits(e.context.data.baseUnlogged, m.baseDecimals) ?? BigInt(0);
    }
    let interest = 0;
    let unlogged = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        if (l.bucket === CV3.earned) interest += l.amount;
        if (l.bucket === CV3.accrued) interest -= l.amount;
      }
      unlogged += r.unlogged;
    }
    // Comet's rounding moves up to two units per row between the lines.
    const slack = 2.0001 * 10 ** -m.baseDecimals * rp.replayed.length;
    const want = Number(rowsInterest) / 10 ** m.baseDecimals;
    const wantU = Number(rowsUnlogged) / 10 ** m.baseDecimals;
    assert.ok(
      Math.abs(interest + unlogged - (want + wantU)) <= slack,
      `${name}: ${interest + unlogged} vs ${want + wantU}`,
    );
    assert.ok(Math.abs(unlogged - wantU) <= slack, `${name}: unlogged ${unlogged} vs ${wantU}`);
  });
}

test("an absorb clears the debt and lends what is left over; its lines add to basePaidOut", () => {
  for (const name of ["usdc-absorbed", "usdt-unlogged", "base-usdc-absorbed"]) {
    const f = fx(name);
    const rp = compoundFlowReplay(rows(f), opts(f));
    const abs = rp.replayed.filter((r) => r.ev.kind === "absorb_debt");
    assert.equal(abs.length, 1, `${name}: one absorb`);
    const r = abs[0];
    const leg = (k: string) => r.legs.filter((l) => l.bucket === k).reduce((a, l) => a + l.amount, 0);
    assert.ok(Math.abs(leg(CV3.cleared) + leg(CV3.credit) - r.ev.delta) < 1e-9, `${name}: paid out`);
    assert.ok(r.base > 0 && Math.abs(leg(CV3.credit) - r.base) < 1e-6, `${name}: the credit is lent`);
    // Every collateral asset is gone after the absorb.
    for (const v of r.coll.values()) assert.ok(v < 1e-9, `${name}: collateral left`);
    // The seized collateral is valued at the absorb's usdValue.
    for (const s of rp.replayed.filter((x) => x.ev.kind === "absorb_collateral" && x.ev.usdValue != null)) {
      const l = s.legs.find((x) => x.bucket === CV3.seized);
      if (!l || l.amount < 1e-6) continue;
      const usd = l.amount * s.price[l.token];
      assert.ok(Math.abs(usd - s.ev.usdValue!) <= Math.max(0.01, s.ev.usdValue! * 1e-6), `${name}: ${usd}`);
    }
  }
  // 0xca29…370a: 40,386.51 USDC cleared, 2,126.08 left over.
  const rp = compoundFlowReplay(rows(fx("usdc-absorbed")), opts(fx("usdc-absorbed")));
  const r = rp.replayed.find((x) => x.ev.kind === "absorb_debt")!;
  assert.ok(Math.abs(r.legs.find((l) => l.bucket === CV3.cleared)!.amount - 40386.511614) < 1e-9);
  assert.ok(Math.abs(r.legs.find((l) => l.bucket === CV3.credit)!.amount - 2126.083137) < 1e-9);
  assert.deepEqual(rp.roles, { collateral: true, supply: true, debt: true });
});

test("a base move no event logs is borrowed to send by transfer", () => {
  const rp = compoundFlowReplay(rows(fx("usdt-unlogged")), opts(fx("usdt-unlogged")));
  const sent = rp.replayed.flatMap((r) => r.legs).filter((l) => l.bucket === CV3.borrowedSent);
  assert.equal(sent.length, 1);
  assert.ok(Math.abs(sent[0].amount - 77.01616) < 1e-9, `${sent[0].amount}`);
});

test("transfers: collateral and lent base received and sent", () => {
  const rp = compoundFlowReplay(rows(fx("usdt-collateral-sent")), opts(fx("usdt-collateral-sent")));
  const legs = rp.replayed.flatMap((r) => r.legs);
  assert.ok(legs.some((l) => l.bucket === CV3.received && l.symbol === "WETH"));
  assert.ok(legs.some((l) => l.bucket === CV3.sent && l.symbol === "WETH"));
  assert.ok(legs.some((l) => l.bucket === CV3.received && l.symbol === "USDT"));
  const lender = compoundFlowReplay(rows(fx("usdc-lender-transfers")), opts(fx("usdc-lender-transfers")));
  assert.deepEqual(lender.roles, { collateral: false, supply: true, debt: false });
  const t = compoundFlowTimeline(rows(fx("usdc-lender-transfers")), opts(fx("usdc-lender-transfers")))!;
  assert.equal(t.labels?.collateral, "Supplied");
  assert.ok(!t.buckets.some((b) => b.side === "debt"), "one bar");
});

test("every flow is priced at its block", () => {
  for (const name of NAMES) {
    const rp = compoundFlowReplay(rows(fx(name)), opts(fx(name)));
    for (const r of rp.replayed)
      for (const l of r.legs) assert.ok(r.own.has(l.token), `${name} ${r.ev.id} ${l.symbol}`);
  }
  // cWETHv3 prices in ETH: the route states dollars, WETH at Comet's WETH/USD.
  const rp = compoundFlowReplay(rows(fx("weth-repaid")), opts(fx("weth-repaid")));
  for (const r of rp.replayed) assert.ok(r.price[rp.base] > 500, `WETH at $${r.price[rp.base]}`);
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
    for (let stop = 0; stop <= m.liveStop; stop++) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const r = sideSumRows(st[side]);
        assert.equal(
          r.lines.reduce((a, l) => a + l.dollars, 0),
          r.total.dollars,
          `${name} ${side} at stop ${stop}: lines add`,
        );
        const src = st[side].sources.reduce((a, s) => a + s.value, 0);
        assert.ok(Math.abs(src - st[side].total) < 1e-6 * Math.max(1, st[side].total), `${name} ${side} ${stop}`);
      }
    }
    const end = stateAt(m, m.liveStop);
    if (["usdc-repaid", "usdc-absorbed", "weth-repaid", "base-usdc-lender"].includes(name)) {
      assert.equal(Math.round(end.collateral.now), 0, `${name}: closed`);
      assert.equal(Math.round(end.debt.now), 0, `${name}: closed`);
    }
  });

  test(`${name}: every event card's sum is exact, its token lines add to the recorded balance, its ledgers add`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = compoundFlowReplay(rows(f), opts(f));
    const focus = compoundFocusEvents(rp);
    let ledgers = 0;
    for (const fe of focus) {
      const cum = eventCum(m, focus, fe.id);
      assert.ok(cum, `${name} ${fe.id}: its day`);
      assert.ok(cum.exact, `${name} ${fe.id}: the legs add to the day row's move`);
      for (const side of ["collateral", "debt"] as const) {
        const sb = compoundSideBalances(rp, fe.id, side)!;
        if (sb.balances.length === 0) continue;
        const usd = eventSideSum(m, side, cum, sb.held);
        assert.equal(
          usd.lines.reduce((a, l) => a + l.dollars, 0),
          usd.total.dollars,
          `${name} ${fe.id} ${side}: lines add`,
        );
        const bySum = eventAssetSum(m, focus, side, cum, fe.id, sb.balances);
        assert.ok(bySum, `${name} ${fe.id} ${side}: a sum by asset`);
        // Each asset's interest past its flows is the rounding at most.
        for (const i of bySum.interest)
          assert.ok(Math.abs(i.amount) <= 1e-5 * Math.max(1, sb.held), `${name} ${fe.id}: ${i.symbol} ${i.amount}`);
        const single = assetTokenSum(bySum);
        if (single) {
          const scale = 10 ** single.decimals;
          assert.equal(
            single.total.units,
            Math.round(Math.max(0, sb.balances.find((b) => b.symbol === single.symbol)!.amount) * scale),
          );
          assert.equal(
            single.lines.reduce((a, l) => a + l.units, 0),
            single.total.units,
            `${name} ${fe.id} ${side}: token lines add`,
          );
          const dollars = eventSideSumByAsset(m, bySum, cum, sb.held);
          const l = tokenLedger({
            model: m,
            side,
            ev: fe,
            sum: single,
            usd: { lines: dollars.lines, dollars: dollars.total.dollars, before: sb.heldBefore },
          });
          const adds = ledgerAdds(l);
          assert.ok(adds.tokens && adds.usd, `${name} ${fe.id} ${side}: the ledger adds`);
        } else {
          const { assets } = assetLedgers({
            model: m,
            side,
            ev: fe,
            sum: bySum,
            held: sb.held,
            heldBefore: sb.heldBefore,
          });
          for (const a of assets) assert.ok(ledgerAdds(a).tokens, `${name} ${fe.id} ${side} ${a.symbol}: tokens add`);
        }
        ledgers++;
      }
    }
    assert.ok(ledgers > 0);
  });

  test(`${name}: the daily line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = compoundFlowTimeline(rows(f), opts(f))!;
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
  const f = fx("usdc-repaid");
  const t = compoundFlowTimeline(rows(f), opts(f))!;
  const m = buildFlowModel(t)!;
  const rp = compoundFlowReplay(rows(f), opts(f));
  const startDay = m.start / 86_400_000;
  // The 1,020.46 USDC repayment: the day before it, the debt stands between
  // the row before's balance and the balance just before the repayment.
  const i = rp.replayed.findIndex((r) => r.ev.kind === "supply");
  const r = rp.replayed[i];
  const prev = rp.replayed[i - 1];
  const owedBefore = -(r.base - r.ev.delta);
  const dayBefore = Math.floor(r.ev.ts / DAY) - 1 - startDay;
  assert.ok(dayBefore > Math.floor(prev.ev.ts / DAY) - startDay, "a quiet day between");
  const st = stateAt(m, dayBefore).debt.now;
  const price = prev.price[rp.base];
  assert.ok(st > -prev.base * price && st < owedBefore * price, `owed ${st} between ${-prev.base} and ${owedBefore}`);
});

test("the state card between events states the base grown by its index, at the chart's figure", () => {
  const f = fx("usdc-absorbed");
  const m = model(f);
  const rp = compoundFlowReplay(rows(f), opts(f));
  const focus = compoundFocusEvents(rp);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let stop = 1; stop < m.liveStop; stop++) {
    if (m.eventDays.includes(stop)) continue;
    const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
    if (!mo) continue;
    const lent = mo.sides.collateral.assets.find((a) => a.symbol === "USDC");
    if (!lent) continue;
    checked++;
    // The tokens are the recorded balance grown by the index, the chart's.
    assert.ok(lent.grown, `stop ${stop}: grown`);
    assert.ok(lent.tokens >= lent.recorded, `stop ${stop}`);
    const held = m.heldAt[stop].find((h) => h.side === "collateral" && h.symbol === "USDC")!;
    assert.ok(Math.abs((held.amount ?? 0) - lent.tokens) < 1e-9, `stop ${stop}: the chart's tokens`);
  }
  assert.ok(checked > 0);
});

// ── Stored prices (rails-server mig 372) and the daily store ──────────────────

const STORED = JSON.parse(readFileSync(join(__dirname, "fixtures", "compound-stored-prices.json"), "utf8")) as {
  v3: Record<string, { blocks: Record<string, StoredCometBlock>; missing: number[] }>;
};
function assetsOf(f: Fixture): string[] {
  const m = marketFor(f);
  return compoundAssets(compoundFlowEvents(served(f), m.baseToken, m.baseDecimals), m.baseToken);
}

for (const name of NAMES) {
  test(`${name}: the stored prices are the archive read's, to the bit`, () => {
    const f = fx(name);
    const stored = STORED.v3[name];
    assert.ok(stored, `${name}: stored answer`);
    assert.deepEqual(stored.missing, [], `${name}: every block stored`);
    for (const [b, archive] of Object.entries(f.prices)) {
      const s = stored.blocks[b];
      assert.ok(s, `${name} ${b}: stored`);
      assert.deepEqual(storedCometPrices(s, assetsOf(f)), archive, `${name} ${b}`);
    }
  });

  test(`${name}: a panel read from the stored prices, the rest from the archive, is the archive panel`, () => {
    const f = fx(name);
    const m = marketFor(f);
    const assets = assetsOf(f);
    // Every other block as if not stored yet: those come from the archive.
    const blocks = Object.keys(f.prices)
      .map(Number)
      .sort((a, b) => a - b);
    const missing = new Set(blocks.filter((_, i) => i % 2 === 1));
    const mixed = new Map<number, Record<string, number>>();
    for (const b of blocks) {
      const r = missing.has(b) ? f.prices[String(b)] : storedCometPrices(STORED.v3[name].blocks[String(b)], assets);
      if (r) mixed.set(b, r);
    }
    const fromStore = compoundFlowTimeline(compoundFlowEvents(served(f), m.baseToken, m.baseDecimals, mixed), opts(f));
    const fromArchive = compoundFlowTimeline(rows(f), opts(f));
    assert.deepEqual(fromStore, fromArchive, `${name}: the same timeline`);
  });
}

test("the daily store prices a quiet day; an event's day keeps the row's price", () => {
  const f = fx("usdc-open-received");
  const m = marketFor(f);
  const base = m.baseToken.toLowerCase();
  const evs = rows(f);
  const days = [...new Set(evs.map((e) => Math.floor(e.ts / DAY)))].sort((a, b) => a - b);
  // A quiet day: the first day after the first event day that no row is on.
  let quiet = days[0] + 1;
  while (days.includes(quiet)) quiet++;
  const eventDay = days[1] ?? days[0];
  const wbtc = assetsOf(f).find((t) => t !== base)!;
  const daily = {
    [wbtc]: [[eventDay, 1] as [number, number], [quiet, 12_345] as [number, number]].sort((a, b) => a[0] - b[0]),
    [base]: [[quiet, 0.5] as [number, number]],
  };
  const carried = compoundFlowTimeline(evs, opts(f))!;
  const stored = compoundFlowTimeline(evs, { ...opts(f), dailyPrices: daily })!;
  const at = (t: typeof stored, asset: string, d: number) => t.dailyPrices![asset].find(([x]) => x === d)?.[1];
  const coll = `coll:${wbtc}`;
  assert.ok(stored.dailyPrices![coll], "the collateral's series");
  assert.equal(at(stored, coll, quiet), 12_345, "a quiet day takes the store's price");
  assert.equal(at(carried, coll, quiet), undefined, "without the store the day carries");
  assert.equal(at(stored, coll, eventDay), at(carried, coll, eventDay), "an event's day keeps the row's price");
  assert.equal(at(stored, "base-supply", quiet), 0.5, "the base too");
  assert.ok(stored.words?.linePrices?.includes("end of the day"), "the words name the day's price");
  assert.ok(!carried.words?.linePrices?.includes("end of the day"), "and only with the store");
});
