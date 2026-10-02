// verify-frankencoin-flows — a Frankencoin position's Lifetime flows
// (lib/frankencoin/flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Frankencoin").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 2 Oct 2026 from the page's routes
// (scripts/verify/fixtures/frankencoin-flows.json: /api/frankencoin/timeline,
// the live read /api/chain/frankencoin/position, the receipt read of every
// mint and repayment and an original's opening read,
// /api/chain/frankencoin/event, off victoria and the archive):
//
//   closed-repaid      V1 WETH clone 0xbd56…53ee: minted at the clone (its
//                      row understates the collateral), repaid, minted again,
//                      closed (14 events)
//   open-minted        V2 LsETH clone 0x0329…bbd6: open, three mints and three
//                      repayments (18 events)
//   challenge-sales    V1 REALU original 0xf652…620e: three challenge sales
//                      cleared all its debt (17 events)
//   challenge-no-debt  V1 WETH original 0xa73e…c639: no debt, its collateral
//                      sold in five slices of one challenge (19 events)
//   forced-sale        V2 clone 0x1ca3…acea: sold at expiry (11 events)
//   opening-deposit    V2 SPYon original 0x6880…60ce: the opening deposit no
//                      MintingUpdate records, read from the receipt; open
//   forced-opening     V2 original 0xa991…4aaf: the opening deposit read from
//                      the receipt, then sold at expiry
//   closed-many        V2 LsETH clone 0xf73f…839c: 65 ledger rows, closed
//
// Held: the replay meets every row's stated collateral and debt to the base
// unit, and the figure each row states before it (no move outside the rows);
// every mint and repayment whose receipt was read is split, the parts adding
// to the row's move, the interest the receipt's Profit; a sale row's falls are
// its sale's lines; at every day and the live stop each side's printed lines
// add to its printed total, in its own token; the live stop meets the live
// read; each event card's sum is exact, its token lines add to the recorded
// balance and its ledger adds; the line's points are the bars' figures; the
// state card between rows states the chart's figures in tokens; and with no
// receipt read the rows stay whole and still add.
//
//   npx tsx --test scripts/verify/verify-frankencoin-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { FrankencoinEventRead } from "@/lib/sources/chain/frankencoin-event";
import {
  FC,
  decimalUnits,
  frankencoinFlowEvents,
  frankencoinFlowFacts,
  frankencoinFlowReplay,
  frankencoinFlowTimeline,
  frankencoinFocusEvents,
  frankencoinLifetimeDebt,
  type FrankencoinFlowOptions,
} from "@/lib/frankencoin/flows";
import { applyFrankencoinOpening } from "@/lib/frankencoin/use-event-read";
import { buildFlowModel, stateAt, unitOf, windowModel, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";

interface Fixture {
  name: string;
  position: string;
  collSymbol: string;
  live: { coll: number; debt: number; isClosed: boolean; isClone: boolean };
  events: BaseActivityEvent[];
  reads: Record<string, FrankencoinEventRead>;
  opening: FrankencoinEventRead | null;
}

const FIX = join(__dirname, "fixtures", "frankencoin-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
/** 2 Oct 2026, 06:00 UTC: after every fixture's last row. */
const NOW = 1_790_920_800;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
const ZERO = BigInt(0);
const OUT = new Set<string>([
  FC.withdrawn,
  FC.soldChallenge,
  FC.soldForced,
  FC.repaid,
  FC.reserveBack,
  FC.repaidWhole,
  FC.clearedChallenge,
  FC.clearedForced,
]);
const COLL = new Set<string>([FC.deposited, FC.withdrawn, FC.soldChallenge, FC.soldForced]);

/** The page's rows: the opening read put in place, as the page does. */
const prepared = (f: Fixture) =>
  applyFrankencoinOpening(
    f.events as Parameters<typeof applyFrankencoinOpening>[0],
    f.opening?.opening ? f.opening : null,
  );
const readMap = (f: Fixture) => new Map<string, FrankencoinEventRead | null>(Object.entries(f.reads));
const rows = (f: Fixture, withReads = true) => frankencoinFlowEvents(prepared(f), withReads ? readMap(f) : null);
const open = (f: Fixture) => !f.live.isClosed;
function opts(f: Fixture): FrankencoinFlowOptions {
  return { collSymbol: f.collSymbol, now: NOW, open: open(f), live: { coll: f.live.coll, debt: f.live.debt } };
}
function model(f: Fixture, withReads = true): FlowModel {
  const t = frankencoinFlowTimeline(rows(f, withReads), opts(f));
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const human = (v: bigint, d: number) => Number(v) / 10 ** d;

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-repaid",
    "open-minted",
    "challenge-sales",
    "challenge-no-debt",
    "forced-sale",
    "opening-deposit",
    "forced-opening",
    "closed-many",
  ]);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's stated balances, and the figure each row starts from`, () => {
    const f = fx(name);
    const rp = frankencoinFlowReplay(rows(f), opts(f));
    let coll = 0;
    let debt = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.ev.id}: a positive leg`);
        const sign = OUT.has(l.bucket) ? -1 : 1;
        if (COLL.has(l.bucket)) coll += sign * l.amount;
        else debt += sign * l.amount;
      }
      if (r.ev.collAfter != null) assert.equal(r.collRaw, r.ev.collAfter, `${name} ${r.ev.id}: collateral`);
      if (r.ev.mintedAfter != null) assert.equal(r.debtRaw, r.ev.mintedAfter, `${name} ${r.ev.id}: debt`);
      assert.ok(near(coll, r.coll, 1e-9), `${name} ${r.ev.id}: the legs add to the collateral`);
      assert.ok(near(debt, r.debt, 1e-9), `${name} ${r.ev.id}: the legs add to the debt`);
    }
    // No row starts from a figure the row before did not leave.
    const facts = frankencoinFlowFacts(rp, opts(f).live, open(f));
    assert.equal(facts.collGaps, 0, `${name}: collateral gaps`);
    assert.equal(facts.debtGaps, 0, `${name}: debt gaps`);
    // The live read meets the last row.
    assert.equal(facts.liveGap, null, `${name}: the live read meets the last row`);
  });
}

test("every mint and repayment whose receipt was read is split, its parts the receipt's", () => {
  let mints = 0;
  let repays = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const rp = frankencoinFlowReplay(rows(f), opts(f));
    for (const r of rp.replayed) {
      const read = f.reads[r.ev.id];
      const leg = (k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
      assert.ok(!r.unsplit, `${name} ${r.ev.id}: split`);
      if (!read) continue;
      if (r.debtRaw > (rp.replayed[rp.replayed.indexOf(r) - 1]?.debtRaw ?? ZERO)) {
        mints++;
        assert.ok(near(leg(FC.interest), Number(read.interest)), `${name} ${r.ev.id}: interest`);
        assert.ok(near(leg(FC.paidOut), Number(read.mintedOut)), `${name} ${r.ev.id}: paid out`);
        const toReserve = decimalUnits(read.mintedToReserve, 18)!;
        const interest = decimalUnits(read.interest, 18)!;
        assert.ok(near(leg(FC.reserve), human(toReserve - interest, 18)), `${name} ${r.ev.id}: reserve share`);
      } else {
        repays++;
        assert.ok(leg(FC.repaid) + leg(FC.reserveBack) > 0, `${name} ${r.ev.id}: a split repayment`);
        assert.ok(near(leg(FC.reserveBack), Number(read.reserveReturned) + Number(read.burnedFromReserve)));
      }
    }
  }
  assert.ok(mints >= 10, `${mints} mints split`);
  assert.ok(repays >= 10, `${repays} repayments split`);
});

test("each split adds to its row's move to the base unit", () => {
  for (const name of NAMES) {
    const f = fx(name);
    const ev = rows(f);
    let minted = ZERO;
    for (const e of ev) {
      if (e.mintedAfter == null) continue;
      const act = e.mintedAfter - minted;
      const s = e.split;
      if (s && e.sale == null && act !== ZERO) {
        if (act > ZERO) assert.equal(s.mint!.received + s.mint!.reserve + s.mint!.interest, act, `${name} ${e.id}`);
        else assert.equal(s.repay!.paid + s.repay!.reserveBack, -act, `${name} ${e.id}`);
      }
      minted = e.mintedAfter;
    }
  }
});

test("a sale row's falls are its sale's lines", () => {
  const legsOf = (name: string, k: string) =>
    frankencoinFlowReplay(rows(fx(name)), opts(fx(name))).replayed.reduce(
      (a, r) => a + (r.legs.find((l) => l.bucket === k)?.amount ?? 0),
      0,
    );
  // Three challenges sold 50,000 REALU and cleared 40,000 ZCHF.
  assert.ok(near(legsOf("challenge-sales", FC.soldChallenge), 50_000));
  assert.ok(near(legsOf("challenge-sales", FC.clearedChallenge), 40_000));
  assert.equal(legsOf("challenge-sales", FC.repaid) + legsOf("challenge-sales", FC.withdrawn), 0);
  // Five slices sold its 2 WETH; no debt.
  assert.ok(near(legsOf("challenge-no-debt", FC.soldChallenge), 2));
  // Sold at expiry: 2.0263 and 1,300 ZCHF cleared.
  assert.ok(near(legsOf("forced-sale", FC.soldForced), 2.026324290678777));
  assert.ok(near(legsOf("forced-sale", FC.clearedForced), 1300));
  assert.equal(legsOf("forced-sale", FC.soldChallenge), 0);
  const facts = frankencoinFlowFacts(
    frankencoinFlowReplay(rows(fx("challenge-sales")), opts(fx("challenge-sales"))),
    null,
    false,
  );
  assert.equal(facts.challengeSales, 3);
});

test("a sale day draws the red liquidation triangle; other days a side's dot", () => {
  for (const name of ["challenge-sales", "challenge-no-debt", "forced-sale"]) {
    const m = model(fx(name));
    const marks = new Set(m.ticks.map((t) => t.tick));
    assert.ok(marks.has("liquidation"), `${name}: a sale day is red`);
    assert.ok(!marks.has("caution") && !marks.has("redemption"), `${name}: no orange mark`);
  }
  assert.ok(!model(fx("open-minted")).ticks.some((t) => t.tick === "liquidation"), "no sale, no red mark");
});

test("the opening deposit no MintingUpdate records is counted from the receipt", () => {
  for (const name of ["opening-deposit", "forced-opening"]) {
    const f = fx(name);
    assert.ok(f.opening?.opening, `${name}: an opening read`);
    const rp = frankencoinFlowReplay(rows(f), opts(f));
    const first = rp.replayed[0];
    assert.equal(first.ev.kind, "open", `${name}: the Open row is a ledger row`);
    assert.equal(first.collRaw, BigInt(f.opening!.opening!.depositedRaw));
  }
});

test("the V1 clone row that understates its collateral is not read; the next row books the deposit", () => {
  const f = fx("closed-repaid");
  const ev = rows(f);
  assert.equal(ev.filter((e) => e.understated).length, 1);
  const rp = frankencoinFlowReplay(ev, opts(f));
  const i = rp.replayed.findIndex((r) => r.ev.understated);
  assert.equal(rp.replayed[i].legs.filter((l) => COLL.has(l.bucket)).length, 0);
  assert.ok(near(rp.replayed[i + 1].legs.find((l) => l.bucket === FC.deposited)?.amount ?? 0, 333));
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total, in its own token`, () => {
    const f = fx(name);
    const m = model(f);
    assert.equal(m.sideUnits?.collateral.symbol, f.collSymbol);
    assert.equal(m.sideUnits?.debt.symbol, "ZCHF");
    for (let stop = 0; stop <= m.liveStop; stop++) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const u = unitOf(m, side)!;
        const r = sideSumRows(st[side], u);
        assert.equal(
          r.lines.reduce((a, l) => a + l.dollars, 0),
          r.total.dollars,
          `${name} ${side} at stop ${stop}: lines add`,
        );
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${u.symbol}`), l.amount);
        // Nothing moves between rows: no balancing item before the live stop.
        if (stop < m.liveStop)
          assert.ok(
            Math.abs(st[side].sources.find((x) => x.fill === "estimate")?.value ?? 0) < 1e-6,
            `${name} ${side} ${stop}: no remainder`,
          );
      }
    }
    const end = stateAt(m, m.liveStop);
    if (!open(f)) {
      assert.equal(end.collateral.now, 0);
      assert.equal(end.debt.now, 0);
    } else {
      const gc = 10 ** m.sideUnits!.collateral.scale;
      const gd = 10 ** m.sideUnits!.debt.scale;
      assert.ok(near(end.collateral.now / gc, f.live.coll, 1e-9), `${name}: collateral now`);
      assert.ok(near(end.debt.now / gd, f.live.debt, 1e-9), `${name}: debt now`);
    }
    // Each bar on its own axis.
    assert.ok(m.sideAxes);
    const w = windowModel(m, 0);
    assert.equal(w, m);
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the recorded balance`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = frankencoinFlowReplay(rows(f), opts(f));
    const focus = frankencoinFocusEvents(rp, f.collSymbol);
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
          `${name} ${fe.id} ${side}`,
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
    const t = frankencoinFlowTimeline(rows(f), opts(f))!;
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const series = binSeries(binInputFromTimeline(t)!, seriesRouteBinFor(t.today! - startDay))!;
    assert.equal(series.gaps.length, 0, "no gaps");
    for (const [, to, collateral, debt] of series.points.slice(0, -1)) {
      const stop = to - startDay;
      if (stop >= m.liveStop) continue;
      const st = stateAt(m, stop);
      assert.ok(Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6), `coll ${to}`);
      assert.ok(Math.abs((debt ?? 0) - st.debt.now) <= Math.max(1, st.debt.now * 1e-6), `debt ${to}`);
    }
    // No old price anywhere: each side's grain is recorded every day.
    assert.equal(m.stale.size, 0, `${name}: no old price`);
  });
}

test("the state card between rows states the chart's figures in tokens, with no price", () => {
  let checked = 0;
  for (const name of ["open-minted", "opening-deposit"]) {
    const f = fx(name);
    const m = model(f);
    const rp = frankencoinFlowReplay(rows(f), opts(f));
    const focus = frankencoinFocusEvents(rp, f.collSymbol);
    const startDay = m.start / 86_400_000;
    for (let stop = 1; stop < m.liveStop; stop += 5) {
      if (m.eventDays.includes(stop)) continue;
      const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
      if (!mo) continue;
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const a: { usd: number | null; tokens: number } | undefined = mo.sides[side].assets[0];
        if (!a) continue;
        checked++;
        assert.equal(a.usd, null, `${name} ${side} ${stop}: no price`);
        assert.ok(mo.sides[side].priced, "no note of a missing price");
        assert.ok(near(a.tokens, st[side].now / 10 ** m.sideUnits![side].scale, 1e-9), `${name} ${side} ${stop}`);
      }
    }
  }
  assert.ok(checked > 20, `${checked} state cards`);
});

test("with no receipt read the rows stay whole and still add", () => {
  for (const name of NAMES) {
    const f = fx(name);
    const rp = frankencoinFlowReplay(rows(f, false), opts(f));
    const facts = frankencoinFlowFacts(rp, null, false);
    assert.equal(facts.splitMints + facts.splitRepays, 0);
    assert.equal(
      facts.unsplitMints + facts.unsplitRepays,
      Object.keys(f.reads).length,
      `${name}: one whole line a read`,
    );
    const m = model(f, false);
    const end = stateAt(m, m.liveStop);
    for (const side of ["collateral", "debt"] as const) {
      const r = sideSumRows(end[side], unitOf(m, side));
      assert.equal(
        r.lines.reduce((a, l) => a + l.dollars, 0),
        r.total.dollars,
      );
    }
  }
});

test("the closed card's lifetime line: minted, repaid and cleared add up", () => {
  const repaid = frankencoinLifetimeDebt(prepared(fx("closed-repaid")))!;
  assert.ok(near(repaid.minted, 499_500 + 140_000));
  assert.ok(near(repaid.repaid, repaid.minted));
  assert.equal(repaid.cleared, null);
  const sold = frankencoinLifetimeDebt(prepared(fx("challenge-sales")))!;
  assert.ok(near(sold.minted, 40_000));
  assert.equal(sold.cleared?.label, "cleared by challenge sale");
  assert.equal(frankencoinLifetimeDebt(prepared(fx("forced-sale")))!.cleared?.label, "cleared by forced sale");
});

test("the unit scales: the collateral and the debt each about five significant digits", () => {
  const t = frankencoinFlowTimeline(rows(fx("open-minted")), opts(fx("open-minted")))!;
  // Up to 1,764 LsETH and 2.53M ZCHF.
  assert.equal(t.sideUnits!.collateral.scale, 1);
  assert.equal(t.sideUnits!.debt.scale, 0);
});
