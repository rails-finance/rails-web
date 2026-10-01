// verify-maple-flows — a Maple lender's Lifetime flows (lib/maple/flows.ts;
// rails-ops reference/lifetime-flows-scrubber.md, "Maple").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 2 Oct 2026 (scripts/verify/fixtures/maple-flows.json):
// each wallet's /api/maple/timeline off victoria (victoria-ops.sh fetch), and
// the page's /api/maple/positions read (each pool's claim and exit rate at
// head) off a local dev server:
//
//   closed-queue        0x9f2e…74a1: deposited, received by transfer, withdrew
//                       everything through the queue (syrupUSDC)
//   open-two-pools      0xc4ec…d8c1: syrupUSDC open with interest, syrupUSDT
//                       withdrawn in full through the queue
//   transfers-router    0x3f89…aa5f: 476 rows, deposits whose shares leave in
//                       the same transaction, transfers in and out, open
//   direct-withdraw     0xb6c5…94b2: withdrawals without the queue, both pools
//   fill-then-withdraw  0x02b6…2ba4: queue fills that left the claim as it was,
//                       the shares redeemed by a withdrawal after
//   cancelled           0x74d8…0b86: requests cancelled, fills, transfers
//   decreased           0x6823…89af: 872 rows, requests reduced, both pools
//   small-fill-rate     0x84cc…f542: a fill whose ratio prices the pool
//                       coarsely (its claim reads a few base units low)
//
// Held: the replay meets every transaction's recorded claim and its shares
// meet the chain read now; each transaction's amounts leave the interest the
// index states, to rounding; at every day and the live stop the printed lines
// add to the printed total; each event card's sum is exact and its ledger
// adds; the daily line's points are the bars' figures; between events the
// claim follows the pool's rate in a straight line.
//
//   npx tsx --test scripts/verify/verify-maple-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildMapleTimeline, type MvRow } from "@/lib/sources/api/maple-timeline";
import {
  MAPLE_OUT_KEYS,
  MP,
  mapleFlowRows,
  mapleFlowTimeline,
  mapleFocusEvents,
  maplePoolReplays,
  mapleRateAt,
  type MapleFlowReplay,
  type MapleLive,
} from "@/lib/maple/flows";
import { maplePoolOf } from "@/lib/maple/asset-catalog";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries, seriesRouteBinFor } from "@/lib/shared/flows-series";
import { eventCum, eventSideSum, eventTokenSum } from "@/lib/shared/flow-focus";
import { ledgerAdds, tokenLedger } from "@/lib/shared/event-ledger";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";

interface Fixture {
  name: string;
  wallet: string;
  status: string;
  rows: MvRow[];
  live: Record<string, MapleLive & { shares: number }>;
}

const FILE = JSON.parse(readFileSync(join(__dirname, "fixtures", "maple-flows.json"), "utf8")) as {
  now: number;
  fixtures: Fixture[];
};
const ALL = FILE.fixtures;
const NOW = FILE.now;
const NAMES = ALL.map((f) => f.name);
const fx = (name: string) => ALL.find((f) => f.name === name) as Fixture;
const DAY = 86_400;

const events = (f: Fixture): BaseActivityEvent[] => buildMapleTimeline(f.rows, f.wallet).events;
const replays = (f: Fixture): MapleFlowReplay[] => maplePoolReplays(events(f));
const liveOf = (f: Fixture, pool: string): MapleLive | null =>
  f.live[pool]?.claim != null
    ? { claim: f.live[pool].claim, rate: f.live[pool].rate }
    : { claim: null, rate: f.live[pool]?.rate ?? null };
function timeline(f: Fixture, rp: MapleFlowReplay) {
  const cat = maplePoolOf(rp.pool);
  const t = mapleFlowTimeline(rp, {
    assetSymbol: cat.assetSymbol,
    poolSymbol: cat.symbol,
    now: NOW,
    live: liveOf(f, rp.pool),
  });
  assert.ok(t, `${f.name} ${rp.pool}: a timeline`);
  return t;
}
function model(f: Fixture, rp: MapleFlowReplay): FlowModel {
  const m = buildFlowModel(timeline(f, rp));
  assert.ok(m, `${f.name} ${rp.pool}: a model`);
  return m;
}

test("the fixtures are the positions the header names", () => {
  assert.deepEqual(NAMES, [
    "closed-queue",
    "open-two-pools",
    "transfers-router",
    "direct-withdraw",
    "fill-then-withdraw",
    "cancelled",
    "decreased",
    "small-fill-rate",
  ]);
});

for (const name of NAMES) {
  test(`${name}: the replay meets every transaction's recorded claim, and the shares the chain read now`, () => {
    const f = fx(name);
    for (const rp of replays(f)) {
      let claim = 0;
      let checked = 0;
      for (const r of rp.replayed) {
        for (const l of r.legs) claim += (MAPLE_OUT_KEYS.has(l.bucket) ? -1 : 1) * l.amount;
        if (!r.lastOfTx || r.row.claimAfter == null) continue;
        assert.ok(
          Math.abs(claim - r.row.claimAfter) <= 1e-9 * Math.max(1, r.row.claimAfter),
          `${name} ${rp.pool} ${r.row.id}: ${claim} vs ${r.row.claimAfter}`,
        );
        checked++;
      }
      assert.ok(checked > 0);
      // The shares after the last row are what the chain holds now.
      const last = rp.replayed[rp.replayed.length - 1].row;
      const now = f.live[rp.pool]?.shares ?? 0;
      assert.ok(Math.abs(last.sharesHeld - now) < 1e-6, `${name} ${rp.pool}: shares ${last.sharesHeld} vs ${now}`);
      // Every row's amount is accounted for, and nothing is stated as a fall.
      assert.deepEqual(
        {
          unrated: rp.facts.unrated,
          unvalued: rp.facts.unvalued,
          unmatched: rp.facts.unmatched,
          rateFalls: rp.facts.rateFalls,
        },
        { unrated: 0, unvalued: 0, unmatched: 0, rateFalls: 0 },
        `${name} ${rp.pool}`,
      );
    }
  });
}

for (const name of NAMES) {
  test(`${name}: each transaction's interest is the index's, to rounding`, () => {
    const f = fx(name);
    const byPool = mapleFlowRows(events(f));
    for (const rp of replays(f)) {
      const rows = byPool.get(rp.pool)!;
      let ours = 0;
      let stated = 0;
      for (const r of rp.replayed) for (const l of r.legs) if (l.bucket === MP.interest) ours += l.amount;
      for (const r of rows.slice(1)) stated += r.interestSincePrev ?? 0;
      // Each transaction within its rounding (the replay's `unmatched` is zero,
      // above); over the life, a few base units a transaction, and a
      // withdrawal paid at its log's ratio rather than the block's rate
      // (0x6823…89af: 0.0064 USDC on 0.56).
      const txs = new Set(rows.map((r) => r.tx)).size;
      assert.ok(
        Math.abs(ours - stated) <= 0.00001 * txs + 1e-4 * Math.abs(stated),
        `${name} ${rp.pool}: ${ours} vs ${stated}`,
      );
    }
  });
}

test("the buckets each fixture fills", () => {
  const keys = (name: string, pool: string) =>
    new Set(
      replays(fx(name))
        .find((r) => r.pool === pool)!
        .replayed.flatMap((r) => r.legs.map((l) => l.bucket)),
    );
  assert.ok(keys("closed-queue", "syrupusdc").has(MP.queue));
  assert.ok(keys("closed-queue", "syrupusdc").has(MP.received));
  assert.ok(keys("transfers-router", "syrupusdc").has(MP.sent));
  assert.ok(keys("direct-withdraw", "syrupusdc").has(MP.withdrawn));
  assert.equal(replays(fx("open-two-pools")).length, 2, "one replay per pool");
  // The fills that left the claim as it was: the withdrawal after them is the outflow.
  const fw = replays(fx("fill-then-withdraw")).find((r) => r.pool === "syrupusdc")!;
  assert.ok(fw.facts.fillsWithoutPayout > 0);
  // A cancellation moves only the interest since the row before.
  for (const name of ["cancelled", "decreased"])
    for (const rp of replays(fx(name)))
      for (const r of rp.replayed)
        if (r.row.kind === "request_cancel" || r.row.kind === "request_decrease" || r.row.kind === "request")
          for (const l of r.legs) assert.equal(l.bucket, MP.interest, `${name} ${r.row.id}`);
  assert.ok(
    replays(fx("decreased")).some((rp) => rp.replayed.some((r) => r.row.kind === "request_decrease")),
    "a reduced request",
  );
});

for (const name of NAMES) {
  test(`${name}: at every day and the live stop the printed lines add to the printed total`, () => {
    const f = fx(name);
    for (const rp of replays(f)) {
      const m = model(f, rp);
      const sym = maplePoolOf(rp.pool).assetSymbol;
      assert.equal(m.unit?.symbol, sym);
      assert.ok(!m.buckets.some((b) => b.side === "debt"), "one bar");
      for (let stop = 0; stop <= m.liveStop; stop++) {
        const st = stateAt(m, stop).collateral;
        const r = sideSumRows(st, m.unit);
        assert.equal(
          r.lines.reduce((a, l) => a + l.dollars, 0),
          r.total.dollars,
          `${name} ${rp.pool} at stop ${stop}: lines add`,
        );
        const src = st.sources.reduce((a, s) => a + s.value, 0);
        assert.ok(Math.abs(src - st.total) < 1e-6 * Math.max(1, st.total), `${name} ${rp.pool} ${stop}: sources`);
        for (const l of r.lines) assert.ok(l.amount.endsWith(` ${sym}`), l.amount);
      }
      // Today: the chain read where the pool is held, nothing where it is not.
      const end = stateAt(m, m.liveStop).collateral.now / rp.grain;
      const claim = f.live[rp.pool]?.claim ?? 0;
      assert.ok(Math.abs(end - claim) < 1e-9 * Math.max(1, claim), `${name} ${rp.pool}: today ${end} vs ${claim}`);
    }
  });
}

for (const name of NAMES) {
  test(`${name}: every event card's sum is exact, and its ledger adds to the recorded claim`, () => {
    const f = fx(name);
    for (const rp of replays(f)) {
      const m = model(f, rp);
      const focus = mapleFocusEvents(rp, maplePoolOf(rp.pool).assetSymbol);
      assert.equal(focus.length, rp.replayed.length);
      let rows = 0;
      for (const fe of focus) {
        const cum = eventCum(m, focus, fe.id);
        assert.ok(cum, `${name} ${fe.id}: its day`);
        assert.ok(cum.exact, `${name} ${fe.id}: the legs add to the day row's move`);
        const usd = eventSideSum(m, "collateral", cum, fe.sides!.collateral.after);
        assert.equal(
          usd.lines.reduce((a, l) => a + l.dollars, 0),
          usd.total.dollars,
          `${name} ${fe.id}: lines add`,
        );
        const sum = eventTokenSum(m, focus, "collateral", cum, fe.id);
        assert.ok(sum, `${name} ${fe.id}: a token sum`);
        const r = rp.replayed.find((x) => x.row.id === fe.id)!;
        assert.equal(
          sum.total.units,
          Math.round(Math.max(0, r.claim) * 10 ** sum.decimals),
          `${name} ${fe.id}: the claim`,
        );
        assert.equal(
          sum.lines.reduce((a, l) => a + l.units, 0),
          sum.total.units,
          `${name} ${fe.id}: token lines add`,
        );
        const l = tokenLedger({ model: m, side: "collateral", ev: fe, sum, usd: null });
        assert.ok(ledgerAdds(l).tokens, `${name} ${fe.id}: the ledger adds`);
        rows += l.rows.length;
      }
      assert.ok(rows > 0);
    }
  });
}

for (const name of NAMES) {
  test(`${name}: the daily line's points are the bars' figures`, () => {
    const f = fx(name);
    for (const rp of replays(f)) {
      const t = timeline(f, rp);
      const m = buildFlowModel(t)!;
      const span = t.today! - m.start / 86_400_000;
      const bin = seriesRouteBinFor(span);
      const series = binSeries(binInputFromTimeline(t)!, bin)!;
      assert.equal(series.gaps.length, 0, "no gaps");
      if (bin !== "day") continue;
      for (const [, to, collateral] of series.points.slice(0, -1)) {
        const st = stateAt(m, to - m.start / 86_400_000);
        assert.ok(
          Math.abs((collateral ?? 0) - st.collateral.now) <= Math.max(1, st.collateral.now * 1e-6),
          `${name} ${rp.pool} ${to}`,
        );
      }
    }
  });
}

test("between events the claim follows the pool's rate in a straight line", () => {
  const f = fx("open-two-pools");
  const rp = replays(f).find((r) => r.pool === "syrupusdc")!;
  const m = model(f, rp);
  const startDay = m.start / 86_400_000;
  let checked = 0;
  for (let i = 0; i + 1 < rp.replayed.length; i++) {
    const a = rp.replayed[i];
    const b = rp.replayed[i + 1];
    if (!a.lastOfTx || a.claim <= 0 || a.rate == null) continue;
    const dA = Math.floor(a.row.ts / DAY);
    const dB = Math.floor(b.row.ts / DAY);
    for (let d = dA + 1; d < dB; d++) {
      const end = (d + 1) * DAY;
      const r = mapleRateAt(rp.rates, end, NOW, f.live.syrupusdc.rate);
      const want = (a.claim * r!) / a.rate;
      const got = stateAt(m, d - startDay).collateral.now / rp.grain;
      assert.ok(Math.abs(got - want) < 1e-9 * Math.max(1, want), `${d}: ${got} vs ${want}`);
      // Between the two events' rates.
      assert.ok(r! >= Math.min(a.rate, b.rate!) - 1e-12 && r! <= Math.max(a.rate, b.rate!) + 1e-12);
      checked++;
    }
  }
  assert.ok(checked > 0);
});
