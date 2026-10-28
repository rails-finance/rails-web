// verify-alchemix-flows — an Alchemist position's Lifetime flows
// (lib/alchemix/flows.ts, lib/alchemix/flows-health.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Alchemix").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 28 Oct 2026 from the page's routes
// (scripts/verify/fixtures/alchemix-flows.json:
// /api/alchemix/position/<line>/<token>/timeline and its /state, off victoria):
//
//   closed-self-liquidated  eth-aleth/726: deposited, minted, 28 of its 76 redemptions clearing debt,
//                           closed with its collateral on 26 Oct 2026
//   open-redeemed           eth-alusd/1142: 148 mints, 73 deposits, 61 line
//                           redemptions, open
//   open-repaid             eth-aleth/265: four repays, 76 redemptions, open
//   base-open               base-alusdb/23: open on Base
//   base-closed             base-alusdb/29: closed with its collateral on Base
//   base-repaid             base-alusdb/20: repays, burns and withdrawals on
//                           Base, dust left open
//
// Held: the replay meets every row's getCDP reading; each block's legs add to
// the readings' move on both sides; a redemption's legs are its two readings'
// difference; a close leaves nothing and its legs are the close's split; a
// repay's shares are not a collateral leg; every day's printed lines add to
// the printed total; each event card's sum is exact and its token lines add to
// the reading; the live stop meets the live read; the share price line is the
// readings' and today the card's; the collateralisation view is the readings'
// ratio against the lower bound read at each picked event, today the card's,
// and the share price's level today is the card's.
//
//   npx tsx --test scripts/verify/verify-alchemix-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AlchemixV3Context, BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  AX,
  ALCHEMIX_MYT_KEY,
  alchemixFlowEvents,
  alchemixFlowFacts,
  alchemixFlowReplay,
  alchemixFlowTimeline,
  alchemixFocusEvents,
  type AlchemixFlowOptions,
} from "@/lib/alchemix/flows";
import {
  alchemixBoundRead,
  alchemixHealthFinish,
  alchemixHealthSource,
  alchemixRatioPrint,
} from "@/lib/alchemix/flows-health";
import { buildFlowModel, stateAt, type FlowTimeline } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { HEALTH_READS_MAX, healthReadPicks, healthView } from "@/lib/shared/flows-health";
import { flowPriceSeries } from "@/lib/shared/flows-price";
import { collateralTakenRaw, readingsBefore } from "@/lib/alchemix/readings-before";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";

interface Fixture {
  name: string;
  lineKey: string;
  tokenId: string;
  chainId: number;
  status: "open" | "closed";
  mytSymbol: string;
  syntheticSymbol: string;
  underlyingSymbol: string;
  underlyingDecimals: number;
  readAt: string;
  live: {
    block: number;
    sharesRaw: string;
    debtRaw: string | null;
    sharePriceRaw: string;
    collateralizationRaw: string | null;
    lowerBoundRaw: string | null;
  };
  events: BaseActivityEvent[];
}

const FIX = join(__dirname, "fixtures", "alchemix-flows.json");
const ALL = (JSON.parse(readFileSync(FIX, "utf8")) as { fixtures: Fixture[] }).fixtures;
const NAMES = ALL.map((f) => f.name);
const fx = (n: string) => ALL.find((f) => f.name === n)!;
const DAY_S = 86_400;
const WAD = 1e18;

const COLL = new Set<string>([
  AX.deposited,
  AX.withdrawn,
  AX.forcedColl,
  AX.repayFee,
  AX.closedColl,
  AX.returned,
  AX.redeemedColl,
  AX.liquidatedColl,
]);
const IN = new Set<string>([AX.deposited, AX.minted]);

const near = (a: number, b: number, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const sharePrice = (f: Fixture) => Number(f.live.sharePriceRaw) / 10 ** f.underlyingDecimals;
const bound = (f: Fixture) => Number(f.live.lowerBoundRaw) / WAD;

function opts(f: Fixture): AlchemixFlowOptions {
  return {
    underlyingSymbol: f.underlyingSymbol,
    mytSymbol: f.mytSymbol,
    syntheticSymbol: f.syntheticSymbol,
    chainId: f.chainId,
    lineKey: f.lineKey,
    now: Date.parse(f.readAt) / 1000,
    live:
      f.status === "open"
        ? {
            shares: Number(f.live.sharesRaw) / WAD,
            debt: Number(f.live.debtRaw ?? "0") / WAD,
            sharePrice: sharePrice(f),
            block: f.live.block,
          }
        : null,
  };
}
const rows = (f: Fixture) => alchemixFlowEvents(f.events, f.underlyingDecimals);
const replay = (f: Fixture) => alchemixFlowReplay(rows(f));
const timeline = (f: Fixture) => alchemixFlowTimeline(replay(f), opts(f))!;

/** The page's health view, as hooks/useAlchemixFlows.ts builds it. */
function withHealth(f: Fixture): FlowTimeline {
  const rp = replay(f);
  const t = timeline(f);
  const b = bound(f);
  const open = f.status === "open";
  const coll = open && f.live.collateralizationRaw != null ? Number(f.live.collateralizationRaw) / WAD : 0;
  // Each picked event's bound at its block: on every Alchemist the bound has
  // stood at today's across these lives (read 28 Oct 2026).
  const reads = healthReadPicks(
    rp.replayed.map((r) => ({ blockNumber: r.ev.block, timestamp: r.ev.ts })),
    HEALTH_READS_MAX,
  ).map((e) => alchemixBoundRead({ block: e.blockNumber, lowerBound: b }, e.timestamp));
  const hv = healthView(t, reads, {
    liveHf: coll > 0 ? coll / b : null,
    liveLevels: coll > 0 ? { [ALCHEMIX_MYT_KEY]: ((sharePrice(f) * b) / coll) * rp.grain } : null,
    liveLine: b,
    source: alchemixHealthSource(f.chainId, f.underlyingSymbol, f.mytSymbol),
  });
  assert.ok(hv, `${f.name}: a health view`);
  const readDays = new Set(rp.rows.filter((r) => r.reading?.sharePrice != null).map((r) => Math.floor(r.ts / DAY_S)));
  const today = open ? Math.floor(opts(f).now / DAY_S) : null;
  const level = hv.marks[ALCHEMIX_MYT_KEY]?.level;
  return {
    ...t,
    health: alchemixHealthFinish(hv.health, readDays, today),
    priceMarks: hv.marks,
    shareLine: level ? { ...t.shareLine!, series: { ...t.shareLine!.series, level } } : t.shareLine,
  };
}

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-self-liquidated",
    "open-redeemed",
    "open-repaid",
    "base-open",
    "base-closed",
    "base-repaid",
  ]);
  assert.equal(fx("base-open").chainId, 8453);
  assert.equal(fx("open-redeemed").chainId, 1);
  assert.equal(fx("closed-self-liquidated").status, "closed");
  assert.equal(fx("base-closed").status, "closed");
});

for (const name of NAMES) {
  test(`${name}: the replay meets every row's reading, and each block's legs add to the readings' move`, () => {
    const f = fx(name);
    const rp = replay(f);
    assert.ok(rp.replayed.length > 0);
    for (const r of rp.replayed) {
      for (const l of r.legs) assert.ok(l.amount > 0, `${name} ${r.ev.id}: a positive leg`);
      if (r.ev.reading) {
        assert.equal(r.shares, r.ev.reading.shares, `${name} ${r.ev.id}: shares`);
        assert.equal(r.debt, r.ev.reading.debt, `${name} ${r.ev.id}: debt`);
      }
    }
    // Block by block: the legs' net move is the readings' move, where every
    // figure in the block is stated.
    const byBlock = new Map<number, typeof rp.replayed>();
    for (const r of rp.replayed) byBlock.set(r.ev.block, [...(byBlock.get(r.ev.block) ?? []), r]);
    let shares = 0;
    let debt = 0;
    let checked = 0;
    for (const [block, list] of [...byBlock].sort((a, b) => a[0] - b[0])) {
      const last = list[list.length - 1];
      const stated = list.every((r) => r.ev.unstated.length === 0);
      let dColl = 0;
      let dDebt = 0;
      for (const r of list)
        for (const l of r.legs) {
          const s = IN.has(l.bucket) ? 1 : -1;
          if (COLL.has(l.bucket)) dColl += s * l.amount;
          else dDebt += s * l.amount;
        }
      if (stated) {
        checked++;
        // One wei of shares either way is the getCDP rounding.
        const tol = (a: number, b: number) => 2e-18 + 1e-12 * Math.max(a, b);
        assert.ok(Math.abs(shares + dColl - last.shares) <= tol(shares, last.shares), `${name} ${block}: shares`);
        assert.ok(Math.abs(debt + dDebt - last.debt) <= tol(debt, last.debt), `${name} ${block}: debt`);
      }
      shares = last.shares;
      debt = last.debt;
    }
    assert.ok(checked > 0);
  });
}

test("a redemption's legs are the difference of its two readings", () => {
  let n = 0;
  for (const name of NAMES) {
    const f = fx(name);
    const evs = f.events as AlchemistEvent[];
    const before = readingsBefore(evs);
    const rp = replay(f);
    for (const r of rp.replayed) {
      if (r.ev.kind !== "redemption") continue;
      const e = evs.find((x) => x.id === r.ev.id)!;
      const c = e.context.data as AlchemixV3Context;
      const cleared = Number(c.debtClearedFromReadings!.amountRaw) / WAD;
      const taken = Number(collateralTakenRaw(e, before.get(e.blockNumber) ?? null) ?? "0") / WAD;
      const leg = (k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
      assert.ok(near(leg(AX.redeemedDebt), cleared), `${name} ${r.ev.id}: cleared`);
      assert.ok(near(leg(AX.redeemedColl), taken), `${name} ${r.ev.id}: taken`);
      n++;
    }
  }
  assert.ok(n > 50, `${n} redemptions`);
  // Those that cleared and took nothing are not events of the replay.
  const f = fx("closed-self-liquidated");
  const all = f.events.filter((e) => (e.context!.data as AlchemixV3Context).eventType === "redemption").length;
  const drawn = replay(f).replayed.filter((r) => r.ev.kind === "redemption").length;
  assert.equal(all, 76);
  assert.equal(drawn, 28);
  assert.equal(alchemixFlowFacts(replay(f)).redemptions, 28);
});

test("a close leaves nothing: its shares paid the debt, the rest came back, and the debt it paid is the reading before", () => {
  for (const name of ["closed-self-liquidated", "base-closed"]) {
    const rp = replay(fx(name));
    const close = rp.replayed.find((r) => r.ev.kind === "self_liquidated")!;
    assert.ok(close, `${name}: a close`);
    assert.equal(close.shares, 0);
    assert.equal(close.debt, 0);
    const leg = (k: string) => close.legs.find((l) => l.bucket === k)?.amount ?? 0;
    assert.ok(leg(AX.closedColl) > 0 && leg(AX.closedDebt) > 0, `${name}: the close's legs`);
    // The force repay in the close is the close's.
    const forced = rp.replayed.filter((r) => r.ev.kind === "force_repay" && r.ev.tx === close.ev.tx);
    for (const r of forced) assert.equal(r.legs.length, 0, `${name}: the force repay inside the close`);
    // eth-aleth/726: SelfLiquidated 0.053652… + the fee 0.0000553… paid the debt.
    if (name === "closed-self-liquidated") {
      assert.ok(near(leg(AX.closedColl), (53652175769352300 + 55343584404048) / WAD, 1e-12));
      assert.ok(near(leg(AX.closedDebt), 54063855323824301 / WAD, 1e-12));
    }
  }
});

test("a repay's shares come from the caller's wallet: only its fee is a collateral leg", () => {
  let repays = 0;
  for (const name of ["open-repaid", "base-repaid"]) {
    const f = fx(name);
    const rp = replay(f);
    const facts = alchemixFlowFacts(rp);
    assert.ok(facts.repays > 0 && facts.repaySharesIn > 0, `${name}: repays`);
    for (const r of rp.replayed) {
      if (r.ev.kind !== "repay") continue;
      repays++;
      const c = (f.events.find((e) => e.id === r.ev.id)!.context!.data as AlchemixV3Context).resolvedAtCapture!;
      const leg = (k: string) => r.legs.find((l) => l.bucket === k)?.amount ?? 0;
      assert.ok(near(leg(AX.repaid), Number(c.debtCredit) / WAD), `${name} ${r.ev.id}: the resolved credit`);
      assert.ok(near(leg(AX.repayFee), Number(c.collateralFee ?? "0") / WAD), `${name} ${r.ev.id}: the fee`);
      assert.ok(!r.legs.some((l) => l.bucket === AX.withdrawn || l.bucket === AX.deposited));
    }
  }
  assert.ok(repays >= 5, `${repays} repays`);
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop each side's printed lines add to its printed total`, () => {
    const f = fx(name);
    const t = timeline(f);
    const m = buildFlowModel(t)!;
    assert.equal(m.unit?.symbol, f.underlyingSymbol, "the underlying's axis");
    for (let stop = 0; stop <= m.liveStop; stop++) {
      const st = stateAt(m, stop);
      for (const side of ["collateral", "debt"] as const) {
        const r = sideSumRows(st[side], m.unit);
        assert.equal(
          r.lines.reduce((a, l) => a + l.dollars, 0),
          r.total.dollars,
          `${name} ${side} at stop ${stop}: lines add`,
        );
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${f.underlyingSymbol}`), l.amount);
      }
    }
    const end = stateAt(m, m.liveStop);
    const G = 10 ** m.unit!.scale;
    if (f.status === "closed") {
      assert.equal(end.collateral.now, 0, `${name}: closed`);
      assert.equal(end.debt.now, 0, `${name}: closed`);
      // The close rule: the axis ends the day after the close.
      const last = replay(f).replayed.at(-1)!;
      assert.equal(t.today, Math.floor(last.ev.ts / DAY_S) + 1);
    } else {
      const shares = Number(f.live.sharesRaw) / WAD;
      const debt = Number(f.live.debtRaw) / WAD;
      assert.ok(near(end.debt.now / G, debt, 1e-9), `${name}: debt now`);
      assert.ok(near(end.collateral.now / G, shares * sharePrice(f), 1e-9), `${name}: collateral now`);
      // The debt side adds up: minted, less what left, is the debt read now,
      // with nothing left over where every figure is stated.
      const unstated = replay(f).rows.some((r) => r.unstated.length > 0);
      if (!unstated) {
        const rest = end.debt.sources.find((s) => s.fill === "estimate");
        assert.ok(Math.abs(rest?.value ?? 0) / G < 1e-6, `${name}: no debt left unexplained (${rest?.value})`);
      }
    }
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its token lines add to the reading`, () => {
    const f = fx(name);
    const rp = replay(f);
    const m = buildFlowModel(timeline(f))!;
    const focus = alchemixFocusEvents(rp, opts(f));
    assert.equal(focus.length, rp.replayed.length);
    const lastOfTx = new Map<string, (typeof rp.replayed)[number]>();
    for (const r of rp.replayed) lastOfTx.set(r.ev.tx, r);
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
        if (!sum) continue;
        const r = lastOfTx.get(fe.tx!)!;
        const recorded = Math.max(0, side === "debt" ? r.debt : r.shares);
        assert.equal(
          sum.total.units,
          Math.round(recorded * 10 ** sum.decimals),
          `${name} ${fe.id} ${side}: the reading`,
        );
      }
    }
  });
}

for (const name of NAMES) {
  test(`${name}: the share price line is the readings', today the card's`, () => {
    const f = fx(name);
    const t = timeline(f);
    const sl = t.shareLine!;
    assert.equal(sl.asset, ALCHEMIX_MYT_KEY);
    assert.equal(sl.unitLabel, f.underlyingSymbol);
    assert.equal(sl.digits, 6);
    const evs = f.events as AlchemistEvent[];
    for (const [day, price, block] of sl.series.points) {
      const today = f.status === "open" && day === Math.floor(opts(f).now / DAY_S);
      if (today) {
        assert.equal(price, sharePrice(f), `${name}: today the card's share price`);
        assert.equal(block, f.live.block);
        continue;
      }
      const e = evs.find((x) => x.blockNumber === block)!;
      const raw = (e.context.data as AlchemixV3Context).stateAtBlockFromReading!.sharePriceRaw!;
      assert.equal(price, Number(raw) / 10 ** f.underlyingDecimals, `${name} ${day}: the reading's share price`);
    }
    // It stands in place of the shares' price: one line, the vault's.
    const series = flowPriceSeries(t);
    assert.ok(series.some((s) => s.key === sl.series.key));
    assert.ok(!series.some((s) => s.key === ALCHEMIX_MYT_KEY || s.key === "debt"));
  });
}

for (const name of NAMES) {
  test(`${name}: the collateralisation against the lower bound read at each picked event`, () => {
    const f = fx(name);
    const t = withHealth(f);
    const h = t.health!;
    const b = bound(f);
    assert.equal(h.asset.symbol, "Collateralisation");
    assert.equal(h.unit, "ratio");
    assert.equal(h.liquidates, "below");
    assert.ok(/in force at the day's last event/.test(h.level!.summary), "the line's words name the read");
    assert.ok(/in force at each event/.test(h.help!));
    for (const p of h.level!.points) assert.equal(p[1], b, `${name}: the line is the bound read`);
    // Each day's point is shares × share price ÷ debt from the reading in force.
    const rp = replay(f);
    const m = buildFlowModel(t)!;
    const startDay = m.start / 86_400_000;
    const today = Math.floor(opts(f).now / DAY_S);
    let checked = 0;
    for (const [day, v] of h.points) {
      if (f.status === "open" && day === today) continue;
      const end = (day + 1) * DAY_S;
      const r = [...rp.replayed].reverse().find((x) => x.ev.ts < end)!;
      const price = [...rp.rows].reverse().find((x) => x.ts < end && x.reading?.sharePrice != null)!.reading!
        .sharePrice!;
      assert.ok(near(v, (r.shares * price) / r.debt, 1e-9), `${name} ${day - startDay}: ${v}`);
      checked++;
    }
    assert.ok(checked > 0);
    if (f.status === "open") {
      const last = h.points.at(-1)!;
      const card = Number(f.live.collateralizationRaw) / WAD;
      assert.equal(last[0], today);
      assert.ok(near(last[1], card, 1e-12), `${name}: today the card's collateralisation`);
      assert.equal(h.print!(last[1]), alchemixRatioPrint(card));
      // The share price's level today: the card's share price less its drop.
      const lv = t.shareLine!.series.level!.points.at(-1)!;
      assert.equal(lv[0], today);
      assert.ok(near(lv[1], (sharePrice(f) * b) / card, 1e-9), `${name}: today's level`);
    }
    // A day with no reading of its own rests on the last one's share price.
    const readDays = new Set(rp.rows.filter((r) => r.reading?.sharePrice != null).map((r) => Math.floor(r.ts / DAY_S)));
    for (const d of h.heldDays ?? []) assert.ok(!readDays.has(d), `${name}: held ${d}`);
  });
}

test("the card's ratio print: one place under 1,000 %, whole above", () => {
  assert.equal(alchemixRatioPrint(1.1104), "111.0%");
  assert.equal(alchemixRatioPrint(12.345), "1,235%");
  assert.equal(alchemixRatioPrint(150), ">10k%");
});
