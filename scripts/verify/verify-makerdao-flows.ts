// verify-makerdao-flows — a MakerDAO / Sky vault's Lifetime flows
// (lib/makerdao/flows.ts; rails-ops reference/lifetime-flows-scrubber.md, "MakerDAO").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 1 Oct 2026 from the page's routes
// (scripts/verify/fixtures/makerdao-flows.json: /api/makerdao/vault/<id>/timeline,
// the live read /api/chain/makerdao/vault/<id> and the daily price store
// /api/prices/daily, all off victoria):
//
//   closed-repaid        #220 ETH-A: drew, paid back and withdrew in full (2019–2023)
//   open-fee             #2028 ETH-A: open since Dec 2019, the fee building, one give
//   liquidated-returned  #23048 ETH-C: liquidated Jun 2022 (Clipper), the auction's
//                        leftover put back and withdrawn in Apr 2023
//   liquidated-reopened  #27943 WSTETH-A: liquidated Jun 2022, reopened, open
//   bitten-seven         #261 BAT-A: bitten seven times (Cat, 2019–2020), closed
//   forked               #307 ETH-A: moved in from another vault, two gives, open
//   lockstake            urn 0xdfdb…e97c LSEV2-SKY-A: USDS debt, the capped price
//
// Held: the replay meets every row's recorded collateral and debt; every
// collateral act is the row's dink and every debt act its dart × the rate at
// its block; the fee is the row's stated fee since the previous row (or the
// fee a give between them stated as well); every liquidation's legs are its
// seizure and its cleared debt, priced at its block; the rest is priced at its
// day's store price; at every day and the live stop each side's printed lines
// add to its printed total; each event card's sum is exact, its token lines add
// to the recorded balance and its ledger adds; the daily line's points are the
// bars' figures; the live stop meets the live read; between two rows the debt
// runs between what the first recorded and what the second found; and with no
// store the rows take the nearest priced moment.
//
//   npx tsx --test scripts/verify/verify-makerdao-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent, MakerDAOContext } from "@/lib/shared/types/event-shape";
import {
  MK,
  makerFeeRates,
  makerFlowEvents,
  makerFlowTimeline,
  makerFocusEvents,
  makerPricing,
  replayMaker,
  type MakerFlowOptions,
} from "@/lib/makerdao/flows";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";
import { dailyPricesFromAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";

interface Fixture {
  name: string;
  vault: string;
  ilk: string;
  chain: {
    ink: number;
    art: number;
    rate: string;
    debtDai: number;
    priceUsd: number | null;
    stabilityFeeApr: number | null;
  } | null;
  daily: DailyAnswer;
  events: BaseActivityEvent[];
}

const FIX = join(__dirname, "fixtures", "makerdao-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
/** 1 Oct 2026, 22:00 UTC: after every fixture's last row. */
const NOW = 1_790_892_000;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
const OUT = new Set<string>([MK.withdrawn, MK.collMovedOut, MK.seized, MK.repaid, MK.debtMovedOut, MK.cleared]);
const COLL = new Set<string>([MK.deposited, MK.returned, MK.collMovedIn, MK.withdrawn, MK.collMovedOut, MK.seized]);
const ctxOf = (e: BaseActivityEvent) => e.context!.data as MakerDAOContext;

/** The frob that put an auction's leftover back (read on the page from the
 *  Clipper's Take logs; here the row the vault-history matcher picks). */
const RETURNED: Record<string, number> = {
  "liquidated-returned": 24.840920963902756,
  "liquidated-reopened": 64.60802439472351,
};
function returnedIds(f: Fixture): Set<string> {
  const out = new Set<string>();
  const amount = RETURNED[f.name];
  let afterGrab = false;
  for (const e of f.events) {
    const c = ctxOf(e);
    if (c.eventType === "grab") afterGrab = true;
    else if (
      afterGrab &&
      amount != null &&
      c.eventType === "frob" &&
      Math.abs(Number(c.dink) - amount) < 1e-9 &&
      out.size === 0
    )
      out.add(e.id);
  }
  return out;
}

function daily(f: Fixture): [number, number][] | null {
  return dailyPricesFromAnswer(f.daily)[`maker:${f.ilk}`] ?? null;
}
function opts(f: Fixture, store = true): MakerFlowOptions {
  const rate = f.chain ? Number(f.chain.rate) / 1e27 : null;
  return {
    collSymbol: ctxOf(f.events[0]).collateralSymbol,
    debtSymbol: ilkDebtSymbol(f.ilk),
    now: NOW,
    live: f.chain
      ? { price: f.chain.priceUsd, ink: f.chain.ink, debt: f.chain.debtDai, rate, feeApr: f.chain.stabilityFeeApr }
      : null,
    daily: store ? daily(f) : null,
  };
}
const rows = (f: Fixture) => makerFlowEvents(f.events, returnedIds(f))!;
function model(f: Fixture, store = true): FlowModel {
  const t = makerFlowTimeline(rows(f), opts(f, store));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const leg = (legs: { bucket: string; amount: number }[], k: string) => legs.find((l) => l.bucket === k)?.amount ?? 0;

test("the fixtures are the vaults the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid",
    "open-fee",
    "liquidated-returned",
    "liquidated-reopened",
    "bitten-seven",
    "forked",
    "lockstake",
  ]);
  for (const f of ALL) assert.ok(daily(f), `${f.name}: the store answered`);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's recorded balances, and each act is the row's`, () => {
    const f = fx(name);
    const rp = replayMaker(rows(f), opts(f));
    assert.ok(rp.length > 0);
    let coll = 0;
    let debt = 0;
    for (const r of rp) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.ev.id}: a positive leg`);
        const sign = OUT.has(l.bucket) ? -1 : 1;
        if (COLL.has(l.bucket)) coll += sign * l.amount;
        else debt += sign * l.amount;
      }
      assert.ok(near(coll, r.ev.inkAfter), `${name} ${r.ev.id}: collateral ${coll} vs ${r.ev.inkAfter}`);
      assert.ok(near(debt, r.ev.debtAfter), `${name} ${r.ev.id}: debt ${debt} vs ${r.ev.debtAfter}`);
      // The collateral act is dink; the debt act dart × the rate.
      const collAct = r.legs
        .filter((l) => COLL.has(l.bucket))
        .reduce((a, l) => a + (OUT.has(l.bucket) ? -1 : 1) * l.amount, 0);
      assert.ok(near(collAct, r.ev.dink), `${name} ${r.ev.id}: dink`);
      const debtAct = r.legs
        .filter((l) => !COLL.has(l.bucket) && l.bucket !== MK.fee)
        .reduce((a, l) => a + (OUT.has(l.bucket) ? -1 : 1) * l.amount, 0);
      assert.ok(
        near(debtAct, r.ev.debtChange, 1e-12),
        `${name} ${r.ev.id}: dart × rate ${debtAct} vs ${r.ev.debtChange}`,
      );
    }
  });
}

test("the fee is the rows' stated fee since the previous row (a give's included), never negative", () => {
  let checked = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const rp = replayMaker(rows(f), opts(f));
    // The fee a give row stated lands on the next flow row.
    const sorted = [...f.events].sort((a, b) => a.blockNumber - b.blockNumber);
    for (const r of rp) {
      const fee = leg(r.legs, MK.fee);
      assert.ok(fee >= 0);
      const i = sorted.findIndex((e) => e.id === r.ev.id);
      let stated = Number(ctxOf(sorted[i]).interestSincePrevious ?? 0);
      for (let k = i - 1; k >= 0 && ctxOf(sorted[k]).eventType === "give"; k--)
        stated += Number(ctxOf(sorted[k]).interestSincePrevious ?? 0);
      assert.ok(
        Math.abs(fee - stated) < 1e-9 * Math.max(1, r.ev.debtAfter),
        `${name} ${r.ev.id}: fee ${fee} vs ${stated}`,
      );
      if (fee > 0) checked++;
    }
  }
  assert.ok(checked > 20, `${checked} rows with a fee`);
  const open = replayMaker(rows(fx("open-fee")), opts(fx("open-fee")));
  assert.ok(
    open.some((r) => leg(r.legs, MK.fee) > 0),
    "the open vault pays a fee",
  );
});

test("liquidations: the seizure and the cleared debt, at the price at the block", () => {
  let checked = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const rp = replayMaker(rows(f), opts(f));
    for (const r of rp) {
      if (r.ev.kind !== "grab") continue;
      const e = f.events.find((x) => x.id === r.ev.id)!;
      const c = ctxOf(e);
      assert.ok(near(leg(r.legs, MK.seized), -Number(c.dink)), `${name} ${r.ev.id}: seized`);
      assert.ok(near(leg(r.legs, MK.cleared), -Number(c.debtChange)), `${name} ${r.ev.id}: cleared`);
      assert.equal(r.priceFrom, "row", `${name} ${r.ev.id}: priced at its block (mig 111)`);
      assert.equal(r.price, c.priceAtBlock!.usd);
      checked++;
    }
  }
  // 1 + 1 + 7.
  assert.equal(checked, 9);
});

test("an auction's leftover put back is Returned by auction; a fork's moves have their lines", () => {
  for (const name of ["liquidated-returned", "liquidated-reopened"]) {
    const rp = replayMaker(rows(fx(name)), opts(fx(name)));
    const back = rp.filter((r) => leg(r.legs, MK.returned) > 0);
    assert.equal(back.length, 1, name);
    assert.equal(leg(back[0].legs, MK.deposited), 0);
  }
  const rp = replayMaker(rows(fx("forked")), opts(fx("forked")));
  const fork = rp.filter((r) => r.ev.kind === "fork");
  assert.equal(fork.length, 1);
  assert.ok(leg(fork[0].legs, MK.collMovedIn) > 0 && leg(fork[0].legs, MK.debtMovedIn) > 0);
  assert.equal(leg(fork[0].legs, MK.deposited) + leg(fork[0].legs, MK.generated), 0);
});

test("prices: each row at its day's store price, a liquidation at its block, today at the live read", () => {
  for (const name of NAMES) {
    const f = fx(name);
    const byDay = new Map(daily(f)!);
    const rp = replayMaker(rows(f), opts(f));
    const p = makerPricing(rp);
    assert.equal(p.nearest, 0, `${name}: nothing priced off the store`);
    for (const r of rp) {
      if (r.priceFrom === "store") assert.equal(r.price, byDay.get(Math.floor(r.ev.ts / DAY)));
      if (r.priceFrom === "row") assert.equal(r.ev.kind, "grab");
    }
  }
  // The capped ilk: the store holds the capped price.
  const ls = replayMaker(rows(fx("lockstake")), opts(fx("lockstake")));
  assert.ok(
    ls.every((r) => r.price <= 0.04 + 1e-12),
    "LockStake at its cap",
  );
});

test("with no store the rows take the nearest priced moment, and between events the last price carries", () => {
  const f = fx("liquidated-reopened");
  const rp = replayMaker(rows(f), opts(f, false));
  const p = makerPricing(rp);
  assert.equal(p.store + p["store-near"], 0);
  assert.ok(p.row === 1 && p.nearest > 0);
  const t = makerFlowTimeline(rows(f), opts(f, false))!;
  assert.ok(!t.words!.basis!.collateral!.includes("close of its day"));
  const m = buildFlowModel(t)!;
  assert.ok(stateAt(m, m.liveStop).collateral.now > 0);
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const m = model(f);
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
    const end = stateAt(m, m.liveStop);
    const c = f.chain!;
    const last = rows(f)[rows(f).length - 1];
    if (last.inkAfter === 0 && last.debtAfter === 0) {
      assert.equal(end.collateral.now, 0, `${name}: closed`);
      assert.equal(end.debt.now, 0, `${name}: closed`);
    } else {
      // Today meets the live read.
      assert.ok(near(end.debt.now, c.debtDai, 1e-9), `${name}: debt now ${end.debt.now} vs ${c.debtDai}`);
      assert.ok(near(end.collateral.now, c.ink * c.priceUsd!, 1e-9), `${name}: collateral now`);
    }
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const ev = rows(f);
    const m = model(f);
    const o = opts(f);
    const rp = replayMaker(ev, o);
    const focus = makerFocusEvents(rp, makerFeeRates(rp, o), o.collSymbol, o.debtSymbol);
    assert.equal(focus.length, ev.length);
    const lastOfTx = new Map<string, (typeof rp)[number]>();
    for (const r of rp) lastOfTx.set(r.ev.tx ?? r.ev.id, r);
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
        const recorded = Math.max(0, side === "debt" ? r.ev.debtAfter : r.ev.inkAfter);
        assert.equal(sum.total.units, Math.round(recorded * scale), `${name} ${fe.id} ${side}: the recorded balance`);
        assert.equal(
          sum.lines.reduce((a, l) => a + l.units, 0),
          sum.total.units,
          `${name} ${fe.id} ${side}: token lines add`,
        );
        const l = tokenLedger({
          model: m,
          side,
          ev: fe,
          sum,
          usd: { lines: usd.lines, dollars: usd.total.dollars, before: fe.sides![side].before },
        });
        const adds = ledgerAdds(l);
        assert.ok(adds.tokens, `${name} ${fe.id} ${side}: the ledger's tokens add`);
        ledgerRows += l.rows.length;
      }
    }
    assert.ok(ledgerRows > 0);
  });
}

for (const name of NAMES) {
  test(`${name}: the line's points are the bars' figures`, () => {
    const f = fx(name);
    const t = makerFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const bin = seriesRouteBinFor(t.today! - startDay);
    const series = binSeries(binInputFromTimeline(t)!, bin)!;
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      const stop = to - startDay;
      if (stop >= m.liveStop) continue;
      const st = stateAt(m, stop);
      if (collateral != null)
        assert.ok(
          Math.abs(collateral - st.collateral.now) <= Math.max(1e-6, st.collateral.now * 1e-6),
          `${name} coll ${to}: ${collateral} vs ${st.collateral.now}`,
        );
      assert.ok(
        Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1e-6, st.debt.now * 1e-6),
        `${name} debt ${to}: ${debt} vs ${st.debt.now}`,
      );
    }
  });
}

test("between two rows the debt runs from what the first recorded to what the second found", () => {
  const f = fx("open-fee");
  const o = opts(f);
  const t = makerFlowTimeline(rows(f), o)!;
  const m = buildFlowModel(t)!;
  const rp = replayMaker(rows(f), o);
  const rates = makerFeeRates(rp, o);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let i = 0; i + 1 < rp.length; i++) {
    const a = rp[i];
    const b = rp[i + 1];
    if (!(a.ev.debtAfter > 0) || Math.floor(b.ev.ts / DAY) - Math.floor(a.ev.ts / DAY) < 3) continue;
    const day = Math.floor(a.ev.ts / DAY) + 1;
    const owed = stateAt(m, day - startDay).debt.now;
    const before = b.ev.debtAfter - b.ev.debtChange;
    assert.ok(owed >= a.ev.debtAfter && owed <= before, `owed ${owed} between ${a.ev.debtAfter} and ${before}`);
    const expected = a.ev.debtAfter * (1 + rates[i] * (((day + 1) * DAY - a.ev.ts) / 31_557_600));
    assert.ok(near(owed, expected, 1e-9), `${owed} vs ${expected}`);
    // At the next row's block the straight line reaches the debt the row found.
    assert.ok(near(a.ev.debtAfter * (1 + rates[i] * ((b.ev.ts - a.ev.ts) / 31_557_600)), before, 1e-9));
    checked++;
  }
  assert.ok(checked > 3, `${checked} stretches`);
});

test("the state card between events states the chart's figures", () => {
  const f = fx("open-fee");
  const o = opts(f);
  const m = model(f);
  const rp = replayMaker(rows(f), o);
  const focus = makerFocusEvents(rp, makerFeeRates(rp, o), o.collSymbol, o.debtSymbol);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let stop = 1; stop < m.liveStop; stop += 13) {
    if (m.eventDays.includes(stop)) continue;
    const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
    if (!mo) continue;
    const d = mo.sides.debt.assets[0];
    if (!d) continue;
    checked++;
    assert.ok(mo.sides.debt.face);
    const chart = stateAt(m, stop).debt.now;
    assert.ok(near(d.tokens, chart, 1e-9), `stop ${stop}: ${d.tokens} vs ${chart}`);
    assert.ok(mo.accrual, "the fee's accrual");
    assert.ok(near(d.recorded * mo.accrual!.factor, chart, 1e-9), `stop ${stop}: the card's factor`);
  }
  assert.ok(checked > 10, `${checked}`);
});
