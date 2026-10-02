// verify-pwn-flows — a PWN loan's Lifetime flows (lib/pwn/flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "PWN").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 2 Oct 2026 from the page's routes
// (scripts/verify/fixtures/pwn-flows.json: /api/pwn/positions and
// /api/pwn/timeline off victoria, each sliced to its loan):
//
//   repaid-fixed-extended      loan 31 (v1.1, an ERC-721 PIRATE #5302 for
//                              1,380 USDT): four extensions, repaid
//   repaid-fixed-erc20         loan 39 (v1.1, 2.5 of an ERC-20 for 4,700 USDC):
//                              repaid
//   repaid-accruing            loan 60 (v1.3, PWN Bundle #56 for 3,000 USDT at
//                              65% a year): repaid, the note claimed and
//                              burned in the same transaction
//   repaid-unclaimed-accruing  loan 54 (v1.2, 10% a year): repaid, never
//                              claimed
//   defaulted-accruing         loan 61 (v1.3, PWN Bundle #58 for 5,000 USDT at
//                              60% a year): the lender's default claim
//   defaulted-fixed-erc20      loan 37 (v1.1, ERC-20 collateral for DAI): the
//                              lender's default claim
//   lapsed-accruing            loan 55 (v1.3, ERC-20 collateral for WETH at 12%
//                              a year): past its deadline, nobody has claimed
//   lapsed-fixed               loan 26 (v1.1, PWN Bundle for 50 USDC): past its
//                              deadline since 1 Jan 2024, nobody has claimed
//
// Held: the replay meets the terms at every flow row (the collateral locked,
// the principal paid out, a v1.1 repay total or a v1.2/v1.3 accrual sum as
// the page states it on the row's card); the lines add at every row; at every
// day and the live stop each side's printed lines add to its printed total in
// its own token; between rows the debt's balancing item is the contract's
// sum less the recorded debt; a lapsed loan holds its collateral and owes the
// deadline's sum at today, its interest on the Interest line; each event
// card's sum is exact with its token lines and ledger adding; the line's
// points are the bars' figures; the state card between rows states the
// chart's figures in tokens.
//
//   npx tsx --test scripts/verify/verify-pwn-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent, PwnContext } from "@/lib/shared/types/event-shape";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import { viewFromSummary } from "@/lib/pwn/economics";
import { accrueTo, loanCost, loanDeadlineAt } from "@/lib/pwn/economics";
import {
  PWN,
  pwnFlowEvents,
  pwnFlowFacts,
  pwnFlowReplay,
  pwnFlowTimeline,
  pwnFocusEvents,
  pwnOwedRaw,
  type PwnFlowReplay,
} from "@/lib/pwn/flows";
import { pwnFlowLoan } from "@/hooks/usePwnFlows";
import { buildFlowModel, stateAt, unitOf, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import { flowMoment } from "@/lib/shared/flow-moment";

interface Fixture {
  name: string;
  loanId: string;
  wallet: string;
  summary: PwnPositionSummary;
  events: BaseActivityEvent[];
}

const FIX = join(__dirname, "fixtures", "pwn-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
/** 2 Oct 2026, 06:00 UTC: after every fixture's last row. */
const NOW = 1_790_920_800;
const DAY = 86_400;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
const OUT = new Set<string>([PWN.returned, PWN.claimed, PWN.repaid, PWN.cleared]);
const COLL = new Set<string>([PWN.locked, PWN.returned, PWN.claimed]);
const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const ctxOf = (e: BaseActivityEvent) => (e.context as { data: PwnContext }).data;

/** The page's loan view: the listing row with the deadline its last
 *  extension set and the repayment's time (position-view.tsx). */
function view(f: Fixture) {
  const v = viewFromSummary(f.summary);
  const ext = f.events.filter((e) => ctxOf(e).eventType === "extended");
  const last = ext[ext.length - 1] ? ctxOf(ext[ext.length - 1]).extendedDefaultTimestamp : undefined;
  return {
    ...v,
    extendedDueAt: last != null ? Number(last) : (v.extendedDueAt ?? null),
    repaidAt: f.events.find((e) => ctxOf(e).eventType === "paid_back")?.timestamp ?? null,
  };
}
function replay(f: Fixture): PwnFlowReplay {
  const loan = pwnFlowLoan(view(f));
  assert.ok(loan, `${f.name}: the loan's terms`);
  const rp = pwnFlowReplay(loan, pwnFlowEvents(f.events, f.loanId), { now: NOW });
  assert.ok(rp, `${f.name}: a replay`);
  return rp;
}
function model(f: Fixture): FlowModel {
  const t = pwnFlowTimeline(replay(f), { now: NOW });
  assert.ok(t, `${f.name}: a timeline`);
  const m = buildFlowModel(t);
  assert.ok(m, `${f.name}: a model`);
  return m;
}
const legOf = (r: PwnFlowReplay["replayed"][number], k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;

test("the fixtures are the loans the header names", () => {
  assert.deepEqual(NAMES, [
    "repaid-fixed-extended",
    "repaid-fixed-erc20",
    "repaid-accruing",
    "repaid-unclaimed-accruing",
    "defaulted-accruing",
    "defaulted-fixed-erc20",
    "lapsed-accruing",
    "lapsed-fixed",
  ]);
  assert.deepEqual(
    ALL.map((f) => f.loanId),
    ["31", "39", "60", "54", "61", "37", "55", "26"],
  );
});

for (const name of NAMES) {
  test(`${name}: the replay meets the terms at every flow row, and the lines add`, () => {
    const f = fx(name);
    const v = view(f);
    const rp = replay(f);
    const c = v.credit!;
    const dec = c.decimals!;
    let coll = 0;
    let debt = 0;
    for (const r of rp.replayed) {
      for (const l of r.legs) {
        assert.ok(l.amount > 0, `${name} ${r.ev.id}: a positive leg`);
        const sign = OUT.has(l.bucket) ? -1 : 1;
        if (COLL.has(l.bucket)) coll += sign * l.amount;
        else debt += sign * l.amount;
      }
      assert.ok(near(coll, r.coll), `${name} ${r.ev.id}: the collateral legs add`);
      assert.ok(near(debt, r.debt), `${name} ${r.ev.id}: the debt legs add`);
      if (r.ev.kind === "created") {
        // The terms: the collateral locked, the principal paid out.
        const units = v.collateral!.category === "ERC721" ? 1 : v.collateral!.amount;
        assert.equal(legOf(r, PWN.locked), units, `${name}: the collateral locked`);
        assert.equal(legOf(r, PWN.principal), c.amount, `${name}: the principal`);
        // v1.1 owes its repay total from the creation.
        if (v.repayAmountRaw != null) assert.equal(r.debtRaw, BigInt(v.repayAmountRaw), `${name}: the repay total`);
        else assert.equal(r.debtRaw, BigInt(c.amountRaw) + BigInt(v.fixedInterestRaw ?? "0"), `${name}: principal`);
      } else {
        assert.equal(r.coll, 0, `${name} ${r.ev.kind}: nothing left in escrow`);
        assert.equal(r.debtRaw, BigInt(0), `${name} ${r.ev.kind}: nothing owed`);
        const closing = legOf(r, r.ev.kind === "paid_back" ? PWN.repaid : PWN.cleared);
        if (v.repayAmountRaw != null) {
          assert.equal(closing, Number(v.repayAmountRaw) / 10 ** dec, `${name}: the repay total closes it`);
        } else if (r.ev.kind === "paid_back") {
          // What the card states the repayment paid (loanCost, the contract's sum).
          const cost = loanCost(v)!;
          assert.equal(cost.basis, "paid");
          assert.equal(closing, cost.accrual!.total, `${name}: the accrual to the repayment's minute`);
        } else {
          // What the card states owed at the deadline.
          const a = accrueTo(
            c.amountRaw,
            dec,
            v.accruingInterestApr!,
            v.fixedInterestRaw,
            v.createdAt!,
            loanDeadlineAt(v)!,
          )!;
          assert.equal(closing, a.total, `${name}: owed at the deadline`);
        }
      }
    }
    // Every closed loan's interest is its whole cost.
    const facts = pwnFlowFacts(rp, NOW);
    if (!rp.open) {
      const cost = loanCost(v);
      assert.ok(cost);
      assert.ok(near(facts.interest, cost.interest), `${name}: the interest is the loan's cost`);
      assert.ok(near(facts.principal + facts.interest, facts.repaid + facts.cleared), `${name}: the debt adds to zero`);
    }
  });
}

test("each flow row is the loan's: creation, then a repayment or a default claim", () => {
  const kinds = (n: string) =>
    replay(fx(n))
      .replayed.map((r) => r.ev.kind)
      .join(",");
  assert.equal(kinds("repaid-fixed-extended"), "created,paid_back");
  assert.equal(kinds("repaid-accruing"), "created,paid_back");
  assert.equal(kinds("defaulted-accruing"), "created,default_claim");
  assert.equal(kinds("defaulted-fixed-erc20"), "created,default_claim");
  assert.equal(kinds("lapsed-fixed"), "created");
  // Loan 31's four extensions move nothing.
  assert.equal(fx("repaid-fixed-extended").events.filter((e) => ctxOf(e).eventType === "extended").length, 4);
});

test("a default claim's day draws the red liquidation triangle", () => {
  for (const name of ["defaulted-accruing", "defaulted-fixed-erc20"]) {
    const m = model(fx(name));
    assert.equal(m.ticks[m.ticks.length - 1].tick, "liquidation", `${name}: the claim's day is red`);
  }
  assert.ok(!model(fx("repaid-accruing")).ticks.some((t) => t.tick === "liquidation"), "a repaid loan has no red mark");
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add, in its own token`, () => {
    const f = fx(name);
    const rp = replay(f);
    const m = model(f);
    const v = view(f);
    assert.equal(m.sideUnits?.collateral.symbol, v.collateral!.symbol);
    assert.equal(m.sideUnits?.debt.symbol, v.credit!.symbol);
    const startDay = m.start / 86_400_000;
    const gd = 10 ** m.sideUnits!.debt.scale;
    const gc = 10 ** m.sideUnits!.collateral.scale;
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
      }
      // The collateral moves only on a row.
      assert.ok(
        Math.abs(st.collateral.sources.find((x) => x.fill === "estimate")?.value ?? 0) < 1e-6,
        `${name} collateral ${stop}: no remainder`,
      );
      // Between rows the debt's balancing item is the contract's sum less the
      // recorded debt (none on v1.1).
      if (stop < m.liveStop) {
        const end = Math.min((startDay + stop + 1) * DAY, NOW);
        const last = [...rp.replayed].reverse().find((r) => r.ev.ts <= end)!;
        const owed = last.debtRaw > BigInt(0) ? Number(pwnOwedRaw(rp.loan, end)!) / 10 ** rp.loan.creditDecimals : 0;
        const rest = st.debt.sources.find((x) => x.fill === "estimate")?.value ?? 0;
        assert.ok(near(rest / gd, owed - last.debt, 1e-6), `${name} debt ${stop}: the interest since the last row`);
        assert.ok(near(st.debt.now / gd, owed, 1e-9), `${name} debt ${stop}: owed`);
      }
    }
    const end = stateAt(m, m.liveStop);
    if (!rp.open) {
      assert.equal(end.collateral.now, 0);
      assert.equal(end.debt.now, 0);
    } else {
      // A lapsed loan: the collateral still in escrow, the deadline's sum owed,
      // the interest since the creation on the Interest line.
      const units = v.collateral!.category === "ERC721" ? 1 : v.collateral!.amount;
      assert.ok(near(end.collateral.now / gc, units), `${name}: collateral now`);
      const owed = Number(pwnOwedRaw(rp.loan, loanDeadlineAt(v)!)!) / 10 ** rp.loan.creditDecimals;
      assert.ok(near(end.debt.now / gd, owed), `${name}: owed at the deadline`);
      assert.ok(Math.abs(end.debt.sources.find((x) => x.fill === "estimate")?.value ?? 0) < 1e-6, "no remainder today");
      const interest = end.debt.sources.find((x) => x.key === PWN.interest)?.value ?? 0;
      assert.ok(near(interest / gd, owed - v.credit!.amount, 1e-9), `${name}: the interest line today`);
    }
    assert.ok(m.sideAxes, "each bar on its own axis");
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its ledger adds`, () => {
    const f = fx(name);
    const m = model(f);
    const rp = replay(f);
    const focus = pwnFocusEvents(rp);
    let ledgerRows = 0;
    for (const fe of focus) {
      const cum = eventCum(m, focus, fe.id);
      assert.ok(cum, `${name} ${fe.id}: its day`);
      assert.ok(cum.exact, `${name} ${fe.id}: the legs add to the day row's move`);
      const r = rp.replayed.find((x) => x.ev.id === fe.id)!;
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
        const recorded = side === "debt" ? r.debt : r.coll;
        assert.equal(sum.total.units, Math.round(recorded * scale), `${name} ${fe.id} ${side}: the recorded figure`);
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
    const t = pwnFlowTimeline(replay(f), { now: NOW })!;
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
    assert.equal(m.stale.size, 0, `${name}: no old price`);
  });
}

test("the state card between rows states the chart's figures in tokens, with no price", () => {
  let checked = 0;
  for (const name of ["repaid-fixed-extended", "repaid-accruing", "lapsed-accruing", "lapsed-fixed"]) {
    const f = fx(name);
    const m = model(f);
    const focus = pwnFocusEvents(replay(f));
    const startDay = m.start / 86_400_000;
    for (let stop = 1; stop < m.liveStop; stop += 7) {
      if (m.eventDays.includes(stop)) continue;
      const mo = flowMoment(m, focus, (startDay + stop + 1) * DAY - 1);
      if (!mo) continue;
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const a: { usd: number | null; tokens: number } | undefined = mo.sides[side].assets[0];
        if (!a) continue;
        checked++;
        assert.equal(a.usd, null, `${name} ${side} ${stop}: no price`);
        assert.ok(near(a.tokens, st[side].now / 10 ** m.sideUnits![side].scale, 1e-9), `${name} ${side} ${stop}`);
      }
    }
  }
  assert.ok(checked > 20, `${checked} state cards`);
});

test("the interest: v1.1 fixed at creation, v1.2/v1.3 the contract's sum at the close", () => {
  // Loan 31: 1,490.4 USDT repay total on 1,380 principal, owed from the creation.
  const r31 = replay(fx("repaid-fixed-extended")).replayed;
  assert.ok(near(legOf(r31[0], PWN.interest), 110.4));
  assert.equal(legOf(r31[1], PWN.interest), 0);
  // Loan 60: 65% a year from 25 Oct to 9 Dec 2025.
  const r60 = replay(fx("repaid-accruing")).replayed;
  assert.equal(legOf(r60[0], PWN.interest), 0);
  assert.ok(
    legOf(r60[1], PWN.interest) > 200 && legOf(r60[1], PWN.interest) < 250,
    String(legOf(r60[1], PWN.interest)),
  );
  // Loan 61: claimed after its deadline; the interest stops at the deadline.
  const v61 = view(fx("defaulted-accruing"));
  const r61 = replay(fx("defaulted-accruing")).replayed;
  const due = loanDeadlineAt(v61)!;
  assert.ok(r61[1].ev.ts > due, "claimed after the deadline");
  const a = accrueTo(v61.credit!.amountRaw, 6, 6000, "0", v61.createdAt!, due)!;
  assert.equal(legOf(r61[1], PWN.interest), a.interest);
});

test("a lapsed v1.2/v1.3 loan's state card: the contract's sum, stopped at the deadline", () => {
  const f = fx("lapsed-accruing");
  const m = model(f);
  const v = view(f);
  const due = loanDeadlineAt(v)!;
  const sum = m.words.moment?.minuteSum;
  assert.ok(sum, "the moment carries the minute sum");
  assert.equal(sum.deadline, due);
  const focus = pwnFocusEvents(replay(f));
  const startDay = m.start / 86_400_000;
  let before = 0;
  let after = 0;
  for (let stop = 1; stop < m.liveStop; stop++) {
    if (m.eventDays.includes(stop)) continue;
    const close = (startDay + stop + 1) * DAY;
    const mo = flowMoment(m, focus, close - 1);
    if (!mo?.accrual) continue;
    const to = Math.min(close, due);
    // Whole minutes from the start, to the deadline once it has passed.
    assert.equal(mo.accrual.minutes, Math.floor((to - v.createdAt!) / 60), `stop ${stop}`);
    if (close > due) {
      assert.equal(mo.accrual.stopped, due, `stop ${stop}: stopped`);
      after++;
    } else {
      assert.equal(mo.accrual.stopped, undefined);
      before++;
    }
    // The card's interest is the contract's sum: principal × APR × whole minutes ÷ 5,256,000,000.
    const a = mo.sides.debt.assets[0];
    const want = accrueTo(v.credit!.amountRaw, v.credit!.decimals!, sum.apr, "0", v.createdAt!, to)!;
    assert.ok(
      near(a.tokens - a.recorded, Number(want.interest), 1e-9),
      `stop ${stop}: ${a.tokens - a.recorded} vs ${want.interest}`,
    );
  }
  assert.ok(before > 0 && after > 0, `${before} days before the deadline, ${after} after`);
  // A fixed loan's moment carries none.
  assert.equal(model(fx("lapsed-fixed")).words.moment?.minuteSum, undefined);
});
