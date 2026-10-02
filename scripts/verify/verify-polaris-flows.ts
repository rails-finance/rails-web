// verify-polaris-flows — a Polaris CDP's Lifetime flows (lib/polaris/flows.ts;
// rails-ops reference/lifetime-flows-scrubber.md, "Polaris").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 2 Oct 2026 (scripts/verify/fixtures/polaris-flows.json,
// built by build-polaris-flows-fixture.ts): each CDP's /api/polaris/timeline
// rows off victoria and the page's live read (/api/chain/polaris/position):
//
//   closed-repaid       USDp #27376: 37 events, repaid and withdrew in full
//   closed-settled      USDp #2736: closed, the debt settled to zero at the close
//   open-interest       USDp #2420: open, 43 events, interest at every touch
//   liquidated          USDp #31477: liquidated with a surplus to claim
//   liquidated-settled  USDp #2266: a no-change touch that settled the debt to
//                       zero, then liquidated
//   settled-often       USDp #6051: open, settled to zero seven times
//   goldp-open          GOLDp #1763: open, 21 events
//   goldp-liquidated    GOLDp #29: liquidated
//   busiest             USDp #8: open, 45 events, the largest CDP
//
// Held: every row's stated before is the row before's after, and its legs add
// to its stated after to the wei (the CDPUpdated identity); every leg is
// positive; each bucket's lifetime is the ledger's own sum (polarisLifetime);
// a liquidation's two collateral lines are the Liquidation log's seizure and
// surplus; the debt's rate between two rows builds exactly the next row's
// interest; at every day and the live stop each side's printed lines add to
// its printed total, today is the live read and the debt's balancing item is
// zero there (the pending legs on their lines); each event card's sum is
// exact, its token lines add to the recorded balance and its ledger adds; and
// the daily line's points are the bars' figures.
//
//   npx tsx --test scripts/verify/verify-polaris-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPolarisTimeline, type PolarisTimelineRow } from "@/lib/sources/api/polaris-timeline";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import {
  PF,
  PL_COLL_KEYS,
  PL_OUT_KEYS,
  polarisFlowFacts,
  polarisFlowLive,
  polarisFlowRows,
  polarisFlowTimeline,
  polarisFocusEvents,
  replayPolaris,
  units,
  type PolarisReplay,
} from "@/lib/polaris/flows";
import { polarisLifetime } from "@/lib/polaris/economics";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";

interface Fixture {
  name: string;
  market: "usdp" | "goldp";
  id: string;
  now: number;
  rows: PolarisTimelineRow[];
  totalEvents: number;
  chain: PolarisChainResponse;
}

const ALL = (
  JSON.parse(readFileSync(join(__dirname, "fixtures", "polaris-flows.json"), "utf8")) as { fixtures: Fixture[] }
).fixtures;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
const DAY = 86_400;
const YEAR = 31_557_600;
const STABLE = { usdp: "USDp", goldp: "GOLDp" } as const;

const events = (f: Fixture) => buildPolarisTimeline(f.rows, f.market, f.id, f.totalEvents).events;
const open = (f: Fixture) => f.chain.isOpen;
function replay(f: Fixture): PolarisReplay {
  return replayPolaris(polarisFlowRows(events(f)), polarisFlowLive(f.chain), f.now);
}
function model(f: Fixture): FlowModel {
  const t = polarisFlowTimeline(replay(f), {
    stable: STABLE[f.market],
    now: f.now,
    open: open(f),
    live: polarisFlowLive(f.chain),
  });
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const total = (rp: PolarisReplay, k: string) =>
  rp.replayed.reduce((a, r) => a + (r.legs.find((l) => l.bucket === k)?.amount ?? 0), 0);

test("the fixtures are the CDPs the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid",
    "closed-settled",
    "open-interest",
    "liquidated",
    "liquidated-settled",
    "settled-often",
    "goldp-open",
    "goldp-liquidated",
    "busiest",
  ]);
  for (const f of ALL) assert.equal(f.rows.length, f.totalEvents, `${f.name}: the whole history`);
});

for (const name of NAMES) {
  test(`${name}: every row chains, its legs add to its stated after to the wei, and every leg is positive`, () => {
    const f = fx(name);
    const rp = replay(f);
    assert.deepEqual(rp.unchained, [], "rows chain");
    assert.deepEqual(rp.unbalanced, [], "rows balance");
    let coll = 0;
    let debt = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.row.id} ${l.bucket}: a positive leg`);
        const s = PL_OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (PL_COLL_KEYS.has(l.bucket)) coll += s * l.amount;
        else debt += s * l.amount;
      }
      assert.ok(near(coll, r.coll), `${name} ${r.row.id}: collateral ${coll} vs ${r.coll}`);
      assert.ok(near(debt, r.debt), `${name} ${r.row.id}: debt ${debt} vs ${r.debt}`);
      coll = r.coll;
      debt = r.debt;
    }
    for (const r of rp.replayed) assert.equal(r.priceFrom, "row", `${name} ${r.row.id}: priced at its block`);
  });
}

for (const name of NAMES) {
  test(`${name}: each bucket's lifetime is the ledger's own sum`, () => {
    const f = fx(name);
    const rp = replay(f);
    const lt = polarisLifetime(events(f));
    const eq = (a: number, b: number, what: string) =>
      assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${name} ${what}: ${a} vs ${b}`);
    eq(total(rp, PF.deposited), lt.deposited, "deposited");
    eq(total(rp, PF.withdrawn), lt.withdrawn, "withdrawn");
    eq(total(rp, PF.collLiquidated) + total(rp, PF.surplus), lt.collLiquidated, "collateral liquidated");
    eq(total(rp, PF.reward), lt.rewardPeth, "reward pETH");
    eq(total(rp, PF.psmCollIn), lt.collFromPsm, "PSM pETH added");
    eq(total(rp, PF.psmCollOut), lt.collToPsm, "PSM pETH taken");
    eq(total(rp, PF.borrowed), lt.borrowed, "borrowed");
    eq(total(rp, PF.repaid), lt.repaid, "repaid");
    eq(total(rp, PF.debtLiquidated), lt.debtLiquidated, "debt liquidated");
    eq(total(rp, PF.interest), lt.interestCharged, "interest");
    eq(total(rp, PF.stability), lt.stableGains, "stability gains");
    eq(total(rp, PF.psmDebtIn), lt.debtFromPsm, "PSM debt added");
    eq(total(rp, PF.psmDebtOut), lt.debtToPsm, "PSM debt cleared");
    eq(total(rp, PF.settled), lt.mintedToSettle, "settled to zero");
  });
}

test("each extra bucket books where its fixture says", () => {
  // A liquidation's two collateral lines are the Liquidation log's seizure
  // less the surplus, and the surplus.
  for (const name of ["liquidated", "liquidated-settled", "goldp-liquidated"]) {
    const f = fx(name);
    const rp = replay(f);
    const liq = f.rows.find((r) => r.coll_liquidated != null)!;
    assert.ok(liq, `${name}: a liquidation row`);
    const seized = Number(liq.coll_liquidated) / 1e18;
    const surplus = Number(liq.coll_surplus) / 1e18;
    assert.ok(near(total(rp, PF.surplus), surplus, 1e-12), `${name}: surplus`);
    assert.ok(near(total(rp, PF.collLiquidated), seized - surplus, 1e-9), `${name}: liquidated`);
    assert.ok(near(total(rp, PF.debtLiquidated), Number(liq.debt_liquidated) / 1e18, 1e-12), `${name}: debt`);
    assert.ok(polarisFlowFacts(rp, null).liquidated);
  }
  // USDp #31477: 156.79 pETH seized, 12.758 of it the owner's surplus.
  assert.ok(Math.abs(total(replay(fx("liquidated")), PF.surplus) - 12.7581850007887674) < 1e-12);
  assert.ok(total(replay(fx("closed-settled")), PF.settled) > 0);
  assert.equal(polarisFlowFacts(replay(fx("settled-often")), null).settledRows, 7);
  assert.equal(polarisFlowFacts(replay(fx("liquidated-settled")), null).settledRows, 1);
  for (const f of ALL) {
    const rp = replay(f);
    assert.ok(total(rp, PF.interest) > 0, `${f.name}: interest`);
  }
});

for (const name of NAMES) {
  test(`${name}: the debt's rate between two rows builds the next row's interest`, () => {
    const f = fx(name);
    const rp = replay(f).replayed;
    let checked = 0;
    for (let i = 0; i + 1 < rp.length; i++) {
      const a = rp[i];
      const b = rp[i + 1];
      const built = a.debt * a.rate * ((b.row.ts - a.row.ts) / YEAR);
      assert.ok(
        Math.abs(built - units(b.row.accruedInterest)) <= 1e-9 * Math.max(1e-6, units(b.row.accruedInterest)),
        `${name} ${b.row.id}: ${built} vs ${units(b.row.accruedInterest)}`,
      );
      checked++;
    }
    const last = rp[rp.length - 1];
    if (open(f)) {
      // After the last row, the live read's pending interest on the recorded debt.
      assert.ok(near(last.debt, f.chain.recordedDebt, 1e-12), `${name}: recorded debt`);
      const built = last.debt * last.rate * ((f.chain.blockTimestamp - last.row.ts) / YEAR);
      assert.ok(near(built, f.chain.accruedInterest, 1e-9), `${name}: pending interest`);
    } else assert.equal(last.rate, 0);
    assert.ok(checked >= 0);
  });
}

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
    assert.equal(m.unit?.symbol, STABLE[f.market]);
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
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${STABLE[f.market]}`), l.amount);
      }
    }
    const end = stateAt(m, m.liveStop);
    const G = 10 ** m.unit!.scale;
    if (!open(f)) {
      assert.equal(end.collateral.now, 0, `${name}: closed`);
      assert.equal(end.debt.now, 0, `${name}: closed`);
    } else {
      // Today is the live read, the collateral at the feed's price now.
      assert.ok(near(end.debt.now / G, Math.max(0, f.chain.entireDebt), 1e-9), `${name}: debt now`);
      assert.ok(
        near(end.collateral.now / G, f.chain.entireColl * f.chain.price!.pethInDebt, 1e-9),
        `${name}: collateral now`,
      );
      // The pending legs sit on their lines: nothing is left to balance the debt.
      const rest = end.debt.sources.find((s) => s.key === "debt-market");
      assert.ok(
        !rest || Math.abs(rest.value) <= 1e-6 * Math.max(1, end.debt.total),
        `${name}: debt rest ${rest?.value}`,
      );
    }
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = replay(f);
    const focus = polarisFocusEvents(rp, STABLE[f.market]);
    const byId = new Map(rp.replayed.map((r) => [r.row.id, r]));
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
        const r = byId.get(fe.id)!;
        const recorded = side === "debt" ? r.debt : r.coll;
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
    const live = polarisFlowLive(f.chain);
    const t = polarisFlowTimeline(replay(f), { stable: STABLE[f.market], now: f.now, open: open(f), live })!;
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

test("between events the debt grows by its interest and the collateral keeps its event's price", () => {
  let checked = 0;
  for (const f of ALL) {
    const m = model(f);
    const rp = replay(f);
    const focus = polarisFocusEvents(rp, STABLE[f.market]);
    const G = rp.grain;
    const startDay = m.start / 86_400_000;
    const rs = rp.replayed;
    for (let i = 0; i + 1 < rs.length; i++) {
      const a = rs[i];
      const b = rs[i + 1];
      if (Math.floor(rs[i + 1].row.ts / DAY) === Math.floor(a.row.ts / DAY)) continue;
      const day = Math.floor(a.row.ts / DAY) + 1;
      if (day >= Math.floor(b.row.ts / DAY)) continue;
      const end = (day + 1) * DAY;
      const st = stateAt(m, day - startDay);
      const grown = a.debt * (1 + a.rate * ((end - a.row.ts) / YEAR));
      assert.ok(near(st.debt.now / G, grown, 1e-9), `${f.name}: debt after ${a.row.id}`);
      assert.ok(near(st.collateral.now / G, a.coll * a.price, 1e-9), `${f.name}: collateral after ${a.row.id}`);
      const mo = flowMoment(m, focus, end - 1);
      assert.ok(mo, "a state card between events");
      if (a.debt > 0)
        assert.ok(near(mo.sides.debt.assets[0].tokens, grown, 1e-6), "the state card's debt is the chart's");
      checked++;
    }
  }
  assert.ok(checked >= 5, `${checked} quiet stretches`);
});

// A redistribution, written into real rows: none of the 17 Sepolia
// liquidations by 2 Oct 2026 passed anything on, so the fixtures' rows are
// edited the way one would read. The liquidated CDP's Liquidation log moves
// part of its seizure and its cleared debt from the pool's share to
// `_collRedistributed` / `_debtRedistributed`; a receiving CDP's next touch
// states an after-image past its legs by what it received.
test("a redistribution takes its own lines, on the liquidated CDP and on a receiving one, and they add", () => {
  const big = (s: string | null) => BigInt(s ?? "0");
  const linesAdd = (f: Fixture, what: string) => {
    const m = model(f);
    for (let stop = 0; stop <= m.liveStop; stop++) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const r = sideSumRows(st[side], m.unit);
        assert.equal(
          r.lines.reduce((a, l) => a + l.dollars, 0),
          r.total.dollars,
          `${what} ${side} at stop ${stop}: lines add`,
        );
      }
    }
    return m;
  };
  const chainsAndBalances = (rp: PolarisReplay, what: string) => {
    assert.deepEqual(rp.unchained, [], `${what}: rows chain`);
    assert.deepEqual(rp.unbalanced, [], `${what}: rows balance`);
    let coll = 0;
    let debt = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${what} ${l.bucket}: positive`);
        const s = PL_OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (PL_COLL_KEYS.has(l.bucket)) coll += s * l.amount;
        else debt += s * l.amount;
      }
      assert.ok(near(coll, r.coll), `${what} ${r.row.id}: collateral`);
      assert.ok(near(debt, r.debt), `${what} ${r.row.id}: debt`);
    }
  };

  // The liquidated CDP: two fifths of the pool's share passed on instead.
  const base = fx("liquidated");
  const liqAt = base.rows.findIndex((r) => r.coll_liquidated != null);
  const liq = base.rows[liqAt];
  const rColl = (big(liq.coll_liquidated) * BigInt(2)) / BigInt(5);
  const rDebt = (big(liq.debt_liquidated) * BigInt(2)) / BigInt(5);
  const passed: Fixture = {
    ...base,
    name: "liquidated-redistributed",
    rows: base.rows.map((r, i) =>
      i !== liqAt
        ? r
        : {
            ...r,
            coll_liquidated: String(big(r.coll_liquidated) - rColl),
            debt_liquidated: String(big(r.debt_liquidated) - rDebt),
            coll_redistributed: String(rColl),
            debt_redistributed: String(rDebt),
          },
    ),
  };
  const rp = replay(passed);
  chainsAndBalances(rp, "liquidated");
  assert.ok(near(total(rp, PF.collRedistOut), Number(rColl) / 1e18, 1e-12), "collateral passed on");
  assert.ok(near(total(rp, PF.debtRedistOut), Number(rDebt) / 1e18, 1e-12), "debt passed on");
  // The seizure is unchanged: what the pool took, what it passed on and the surplus.
  const before = replay(base);
  assert.ok(
    near(
      total(rp, PF.collLiquidated) + total(rp, PF.collRedistOut) + total(rp, PF.surplus),
      total(before, PF.collLiquidated) + total(before, PF.surplus),
      1e-12,
    ),
  );
  assert.ok(near(total(rp, PF.debtLiquidated) + total(rp, PF.debtRedistOut), total(before, PF.debtLiquidated), 1e-12));
  const m1 = linesAdd(passed, "liquidated");
  const labels1 = m1.buckets.map((b) => b.label);
  assert.equal(labels1.filter((l) => l === "Redistributed to other CDPs").length, 2, "a line on each side");

  // A receiving CDP: 1.5 pETH and 300 USDp arrive at its 20th touch.
  const host = fx("open-interest");
  const k = 19;
  const gColl = BigInt("1500000000000000000");
  const gDebt = BigInt("300000000000000000000");
  const plus = (s: string | null, g: bigint) => String(big(s) + g);
  const received: Fixture = {
    ...host,
    name: "open-received",
    rows: host.rows.map((r, i) =>
      i < k || r.new_coll == null
        ? r
        : {
            ...r,
            new_coll: plus(r.new_coll, gColl),
            new_debt: plus(r.new_debt, gDebt),
            ...(i > k ? { coll_before: plus(r.coll_before, gColl), debt_before: plus(r.debt_before, gDebt) } : {}),
          },
    ),
  };
  const rp2 = replay(received);
  chainsAndBalances(rp2, "receiving");
  assert.ok(near(total(rp2, PF.collRedistIn), 1.5, 1e-12), "Redistribution gains");
  assert.ok(near(total(rp2, PF.debtRedistIn), 300, 1e-12), "Redistributed debt");
  const at = rp2.replayed.find((r) => r.legs.some((l) => l.bucket === PF.collRedistIn))!;
  assert.equal(at.row.id, polarisFlowRows(events(received))[k].id, "on the touch that wrote it in");
  const m2 = linesAdd(received, "receiving");
  const labels2 = m2.buckets.map((b) => b.label);
  assert.ok(labels2.includes("Redistribution gains") && labels2.includes("Redistributed debt"));
  // Nothing passed on to the fixtures as read.
  for (const f of ALL) {
    const r = replay(f);
    for (const key of [PF.collRedistIn, PF.debtRedistIn, PF.collRedistOut, PF.debtRedistOut])
      assert.equal(total(r, key), 0, `${f.name}: ${key}`);
  }
});
