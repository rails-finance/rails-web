// verify-fx-flows — an f(x) position's Lifetime flows (lib/fx/flows.ts;
// rails-ops reference/lifetime-flows-scrubber.md, "f(x)").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 (scripts/verify/fixtures/fx-flows.json,
// built by build-fx-flows-fixture.ts): each position's
// /api/fx/position/:pool/:id/timeline off victoria, the page's
// /api/chain/fx/event-state reads at the blocks the replay needs, and the
// pool's settled read with the anchor price at its block:
//
//   closed-withdrawn   WBTC #760: borrowed, repaid and withdrew in full
//   open-funding       wstETH #249: open since Jan 2025, six tick rebalances on
//                      3 Feb 2025, funding and other positions' bad debt
//   liquidated-closed  wstETH #137: 36 tick rebalances, then liquidated, debt
//                      left unpaid
//   liquidated-many    wstETH #120: liquidated nine times (two in one block),
//                      funded again on the same NFT, closed
//   redemptions        wstETH #243: tick and pool-wide rebalances, three
//                      redemptions, liquidated, funded again, open
//   pool-rebalances    WBTC #484: seven pool-wide rebalance hits, open
//   pool-liquidation   wstETH #209: 75 tick rebalances, liquidated, then a
//                      pool-wide liquidation cleared what was left
//   busiest            wstETH #348: 234 operates, open
//
// Held: the replay meets every block's read (the route's served reads and the
// page's event-state reads) after every block; every leg is positive (funding
// and bad debt never run backwards); each block's acts are its rows' own
// (an operate's token amount × the block's rate, a liquidation's repaid legs,
// a pool-made row's change across its block); at every day and the live stop
// each side's printed lines add to its printed total and today meets the
// pool's settled read; each event card's sum is exact, its token lines add to
// the recorded balance and its ledger adds; the daily line's points are the
// bars' figures; and the own rows are priced by their snapshot, the pool-made
// rows by the min leg at the block before.
//
//   npx tsx --test scripts/verify/verify-fx-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFxTimeline, type RawFxTimelineResponse } from "@/lib/sources/api/fx-timeline";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import {
  FXF,
  FX_COLL_KEYS,
  FX_OUT_KEYS,
  fxFlowReadBlocks,
  fxFlowReplay,
  fxFlowRows,
  fxFlowTimeline,
  fxFocusEvents,
  fxPricing,
  replayFx,
  type FxFlowOptions,
  type FxFlowRow,
  type FxReplayed,
} from "@/lib/fx/flows";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";
import { fxInTxFunding } from "@/lib/fx/in-tx-funding";

interface Fixture {
  name: string;
  pool: "wsteth" | "wbtc";
  id: string;
  status: "open" | "closed" | "unknown";
  now: number;
  resp: RawFxTimelineResponse;
  reads: Record<string, FxStateAt>;
  live: { price: number | null; coll: number | null; debt: number | null } | null;
}

const ALL = (JSON.parse(readFileSync(join(__dirname, "fixtures", "fx-flows.json"), "utf8")) as { fixtures: Fixture[] })
  .fixtures;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
const DAY = 86_400;
const WAD = 1e18;
const SYMBOL = { wsteth: "stETH", wbtc: "WBTC" } as const;

const events = (f: Fixture) => buildFxTimeline(f.resp).events;
const rows = (f: Fixture) => fxFlowRows(events(f));
function replayed(f: Fixture): FxReplayed[] {
  const r = replayFx(rows(f), f.reads, {
    normalizes: f.pool === "wsteth",
    livePrice: f.live?.price ?? null,
    now: f.now,
  });
  assert.ok(r.ok, `${f.name}: the replay runs (${r.ok ? "" : `${r.reason} ${r.blocks.join(",")}`})`);
  return r.replayed;
}
function opts(f: Fixture): FxFlowOptions {
  return { collSymbol: SYMBOL[f.pool], now: f.now, open: f.status === "open", live: f.live };
}
function model(f: Fixture): FlowModel {
  const t = fxFlowTimeline(fxFlowReplay(replayed(f)), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const legOf = (r: FxReplayed, k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
const byBlock = (rs: FxReplayed[]) => {
  const m = new Map<number, FxReplayed[]>();
  for (const r of rs) m.set(r.row.block, [...(m.get(r.row.block) ?? []), r]);
  return m;
};

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-withdrawn",
    "open-funding",
    "liquidated-closed",
    "liquidated-many",
    "redemptions",
    "pool-rebalances",
    "pool-liquidation",
    "busiest",
  ]);
});

test("the fixture holds every read the replay asks for", () => {
  for (const f of ALL) {
    const need = fxFlowReadBlocks(rows(f));
    for (const b of [...need.own, ...need.social])
      for (const k of [b - 1, b]) assert.ok(f.reads[String(k)]?.colls != null, `${f.name}: read at ${k}`);
  }
});

for (const name of NAMES) {
  test(`${name}: every leg is positive, the legs run to each row's balance, and each block ends on the pool's read`, () => {
    const f = fx(name);
    const rp = replayed(f);
    let coll = 0;
    let debt = 0;
    for (const r of rp) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.row.id} ${l.bucket}: a positive leg`);
        const s = FX_OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (FX_COLL_KEYS.has(l.bucket)) coll += s * l.amount;
        else debt += s * l.amount;
      }
      assert.ok(near(coll, r.coll), `${name} ${r.row.id}: collateral ${coll} vs ${r.coll}`);
      assert.ok(near(debt, r.debt), `${name} ${r.row.id}: debt ${debt} vs ${r.debt}`);
      coll = r.coll;
      debt = r.debt;
    }
    for (const [block, g] of byBlock(rp)) {
      const last = g[g.length - 1];
      const served = [...g].reverse().find((r) => r.row.collAfter != null)?.row;
      const read = f.reads[String(block)];
      const collAfter = served?.collAfter ?? Number(read.colls) / WAD;
      const debtAfter = served?.debtAfter ?? Number(read.debts) / WAD;
      assert.equal(last.coll, collAfter, `${name} ${block}: collateral after`);
      assert.equal(last.debt, debtAfter, `${name} ${block}: debt after`);
      if (read && served) {
        assert.ok(near(Number(read.colls) / WAD, collAfter, 1e-12), `${name} ${block}: the route's read is the page's`);
        assert.ok(near(Number(read.debts) / WAD, debtAfter, 1e-12), `${name} ${block}: the route's read is the page's`);
      }
    }
  });
}

for (const name of NAMES) {
  test(`${name}: each block's acts are its rows' own`, () => {
    const f = fx(name);
    const rp = replayed(f);
    const normalizes = f.pool === "wsteth";
    let prevC = 0;
    let prevD = 0;
    for (const [block, g] of byBlock(rp)) {
      const before = f.reads[String(block - 1)];
      const firstLiq = g.find((r) => r.row.kind === "liquidation" && r.row.collBefore != null)?.row;
      const Cb = firstLiq?.collBefore ?? Number(before.colls) / WAD;
      const Db = firstLiq?.debtBefore ?? Number(before.debts) / WAD;
      const sum = (k: string) => g.reduce((a, r) => a + legOf(r, k), 0);
      // The gap since the last block is the pool's, with no row.
      const gapC = Cb - prevC;
      const gapD = Db - prevD;
      if (gapC < -1e-9 * Math.max(1, prevC))
        assert.ok(legOf(g[0], FXF.funding) >= -gapC * (1 - 1e-9), `${name} ${block}: funding`);
      if (gapD > 1e-9 * Math.max(1, prevD))
        assert.ok(legOf(g[0], FXF.badDebt) >= gapD * (1 - 1e-9), `${name} ${block}`);
      const ops = g.filter((r) => r.row.kind === "operate").map((r) => r.row);
      if (ops.length > 0) {
        const rate = normalizes ? Number(f.reads[String(block)].rate) / WAD : 1;
        const moved = ops.reduce((a: number, r: FxFlowRow) => a + r.collMoved * rate, 0);
        const dd = ops.reduce((a: number, r: FxFlowRow) => a + r.debtDelta, 0);
        // An operate's move, to the pool's rounding.
        assert.ok(
          Math.abs(sum(FXF.collIn) - sum(FXF.collOut) - moved) <= 1e-9 * Math.max(1, Math.abs(moved), Cb),
          `${name} ${block}: collateral act`,
        );
        assert.ok(
          Math.abs(sum(FXF.borrowed) - sum(FXF.repaid) - dd) <= 1e-9 * Math.max(1, Math.abs(dd), Db),
          `${name} ${block}: debt act`,
        );
      }
      // The pool's rounding in the block may sit on the largest leg.
      for (const r of g.filter((x) => x.row.kind === "liquidation"))
        assert.ok(
          Math.abs(legOf(r, FXF.debtLiquidated) - r.row.liqRepaid) <= 1e-9 * Math.max(1, Db),
          `${name} ${r.row.id}: repaid legs`,
        );
      if (g.some((r) => r.row.kind !== "operate" && r.row.kind !== "liquidation") && ops.length === 0) {
        const a = f.reads[String(block)];
        const dC = Number(before.colls) / WAD - Number(a.colls) / WAD;
        const dD = Number(before.debts) / WAD - Number(a.debts) / WAD;
        const takenC = sum(FXF.collRebalanced) + sum(FXF.collRedeemed) + sum(FXF.collPoolLiq) + sum(FXF.collSeized);
        const takenD =
          sum(FXF.debtRebalanced) +
          sum(FXF.debtRedeemed) +
          sum(FXF.debtPoolLiq) +
          sum(FXF.debtLiquidated) +
          sum(FXF.unpaid) -
          sum(FXF.badDebt) +
          (gapD > 1e-9 * Math.max(1, prevD) ? gapD : 0);
        assert.ok(Math.abs(takenC - dC) <= 1e-9 * Math.max(1, dC), `${name} ${block}: taken ${takenC} vs ${dC}`);
        assert.ok(Math.abs(takenD - dD) <= 1e-9 * Math.max(1, dD), `${name} ${block}: cleared ${takenD} vs ${dD}`);
      }
      prevC = g[g.length - 1].coll;
      prevD = g[g.length - 1].debt;
    }
  });
}

test("each extra bucket books where its fixture says", () => {
  const total = (name: string, k: string) => replayed(fx(name)).reduce((a, r) => a + legOf(r, k), 0);
  // wstETH #137 (rails-ops TO-DO-ui-jobs, f(x) round 1): 0.151773 stETH seized
  // with the protocol's share, 1.234 fxUSD left unpaid.
  assert.ok(Math.abs(total("liquidated-closed", FXF.collSeized) - 0.15177309) < 1e-8);
  assert.ok(Math.abs(total("liquidated-closed", FXF.unpaid) - 1.23393) < 1e-5);
  // WBTC #484: its seven pool-wide hits sum to 279,215.683 fxUSD.
  assert.ok(Math.abs(total("pool-rebalances", FXF.debtRebalanced) - 279_215.683) < 1e-3);
  assert.ok(total("redemptions", FXF.collRedeemed) > 0 && total("redemptions", FXF.debtRedeemed) > 0);
  assert.ok(total("pool-liquidation", FXF.debtPoolLiq) > 2.1);
  assert.equal(replayed(fx("liquidated-many")).filter((r) => r.row.kind === "liquidation").length, 9);
  assert.ok(total("open-funding", FXF.funding) > 0 && total("open-funding", FXF.badDebt) > 0);
  for (const f of ALL)
    assert.equal(replayed(f).filter((r) => r.unrecorded).length, 0, `${f.name}: no debt fall without a row`);
});

test("funding inside an operate's transaction is the card's figure", () => {
  // lib/fx/in-tx-funding.ts states it from the same reads, on positions with
  // no liquidation of their own.
  for (const name of ["closed-withdrawn", "open-funding", "busiest", "pool-rebalances"]) {
    const f = fx(name);
    const card = fxInTxFunding(events(f), f.reads);
    assert.ok(card, `${name}: the card's figure`);
    const rp = replayed(f);
    let inTx = 0;
    for (const [, g] of byBlock(rp)) {
      const op = g.find((r) => r.row.kind === "operate");
      if (!op || g.some((r) => r.row.kind !== "operate")) continue;
      // The block's funding less the gap's (both on its first row).
      const block = op.row.block;
      const prev = rp[rp.indexOf(g[0]) - 1];
      const gap = prev ? prev.coll - Number(f.reads[String(block - 1)].colls) / WAD : 0;
      inTx += legOf(g[0], FXF.funding) - Math.max(0, gap > 1e-9 * Math.max(1, prev?.coll ?? 0) ? gap : 0);
    }
    assert.ok(Math.abs(inTx - card.total) < 1e-9, `${name}: ${inTx} vs ${card.total}`);
  }
});

test("prices: an own row's snapshot, a pool-made row's min leg at the block before", () => {
  for (const f of ALL) {
    const rp = replayed(f);
    for (const r of rp) {
      if (r.row.kind === "operate" || r.row.kind === "liquidation") {
        assert.equal(r.priceFrom, "row", `${f.name} ${r.row.id}`);
        assert.equal(r.price, r.row.price);
      } else {
        assert.equal(r.priceFrom, "block", `${f.name} ${r.row.id}`);
        assert.equal(r.price, Number(f.reads[String(r.row.block - 1)].minPrice) / WAD);
      }
    }
    const p = fxPricing(fxFlowReplay(rp));
    assert.equal(p.nearest + p.today, 0, `${f.name}: every flow priced at its block`);
  }
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
    assert.equal(m.unit?.symbol, "fxUSD");
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
        for (const l of r.lines) assert.ok(l.amount.endsWith(" fxUSD"), l.amount);
      }
    }
    const end = stateAt(m, m.liveStop);
    const G = 10 ** m.unit!.scale;
    if (f.status !== "open") {
      assert.equal(end.collateral.now, 0, `${name}: closed`);
      assert.equal(end.debt.now, 0, `${name}: closed`);
    } else {
      // Today is the pool's settled read, the collateral at the anchor price.
      assert.ok(near(end.debt.now / G, f.live!.debt!, 1e-6), `${name}: debt now`);
      assert.ok(near(end.collateral.now / G, f.live!.coll! * f.live!.price!, 1e-6), `${name}: collateral now`);
    }
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = fxFlowReplay(replayed(f));
    const focus = fxFocusEvents(rp, SYMBOL[f.pool]);
    const lastOfTx = new Map<string, FxReplayed>();
    for (const r of rp.replayed) lastOfTx.set(r.row.tx ?? r.row.id, r);
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

for (const name of NAMES) {
  test(`${name}: the line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = fxFlowTimeline(fxFlowReplay(replayed(f)), opts(f))!;
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

test("between events each balance stays as its last event left it, at that event's price", () => {
  const f = fx("open-funding");
  const m = model(f);
  const rp = fxFlowReplay(replayed(f));
  const focus = fxFocusEvents(rp, SYMBOL[f.pool]);
  const G = rp.grain;
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let i = 0; i + 1 < rp.replayed.length; i++) {
    const a = rp.replayed[i];
    const b = rp.replayed[i + 1];
    const day = Math.floor(a.row.ts / DAY) + 1;
    if (day >= Math.floor(b.row.ts / DAY)) continue;
    const st = stateAt(m, day - startDay);
    assert.ok(near(st.debt.now / G, a.debt, 1e-9), `debt after ${a.row.id}`);
    assert.ok(near(st.collateral.now / G, a.coll * a.price, 1e-9), `collateral after ${a.row.id}`);
    const mo = flowMoment(m, focus, (day + 1) * DAY - 1);
    assert.ok(mo, "a state card between events");
    assert.ok(near(mo.sides.debt.assets[0].tokens, a.debt, 1e-9), "the state card's debt is the chart's");
    checked++;
  }
  assert.ok(checked >= 5, `${checked} quiet stretches`);
});
