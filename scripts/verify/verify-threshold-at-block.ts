// verify-threshold-at-block — the liquidation line read at each picked block
// on Alchemix V3 and Dolomite (lib/alchemix/flows-health.ts,
// lib/dolomite/flows-health.ts), and the collateral factor changes of
// Compound V2, Moonwell and Compound V3 (lib/shared/collateral-factor-changes.ts;
// rails-ops ui-jobs 328 step 8, reference/lifetime-price-chart.md, the rows).
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read from the page's routes on the date the file names
// (scripts/verify/fixtures/threshold-at-block.json): each position's event
// blocks and times, the picks (the last event of each of the latest 60 days
// with events), each pick's answer from /api/chain/alchemix/bound-at-block or
// /api/chain/dolomite/risk-at-block, and the Dolomite core's risk setter logs
// (/api/chain/dolomite/risk-log).
//
// Held: the picks are healthReadPicks' over the events; every day's line is
// the answer of the latest pick on or before it (Alchemix the lower bound,
// Dolomite 1 + the core's ratio for the account), the days before the first
// pick taking its answer, dotted; the markers are the steps (Alchemix, seen
// at a pick) or the setter logs that moved a value on a market the account
// used (Dolomite), each with its before → after; a stepped answer moves the
// line and draws a marker on the pick's day.
//
//   npx tsx --test scripts/verify/verify-threshold-at-block.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEALTH_READS_MAX, healthReadPicks, healthView, type FactorRead } from "@/lib/shared/flows-health";
import type { FlowTimeline } from "@/lib/shared/flows-timeline";
import { ALCHEMIX_DEBT_KEY, ALCHEMIX_MYT_KEY } from "@/lib/alchemix/flows";
import {
  alchemixBoundChanges,
  alchemixBoundRead,
  alchemixHealthSource,
  type AlchemixBoundAt,
} from "@/lib/alchemix/flows-health";
import {
  DOLOMITE_HEALTH_SOURCE,
  dolomiteRiskChanges,
  dolomiteRiskRead,
  type DolomiteRiskAtAnswer,
  type DolomiteRiskLog,
} from "@/lib/dolomite/flows-health";
import { changesByDay } from "@/lib/shared/flows-changes";
import {
  cometFactorChanges,
  cometFactorSteps,
  ctokenFactorChanges,
  factorChangePicks,
  factorPct,
  type CometFactorLog,
  type CTokenFactorLog,
  type FactorChange,
} from "@/lib/shared/collateral-factor-changes";
import { alsoPicks } from "@/hooks/useFlowsHealth";
import type { CompoundDeploymentKey } from "@/lib/compound/deployments";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";

const DAY_S = 86_400;

interface Ev {
  block: number;
  ts: number;
}
interface DoloFixture {
  name: string;
  owner: string;
  accountNumber: string;
  events: Ev[];
  markets: Record<string, string>;
  picks: number[];
  answers: Record<string, DolomiteRiskAtAnswer>;
}
interface AlxFixture {
  name: string;
  chain: number;
  line: string;
  token: string;
  alchemist: string;
  events: Ev[];
  picks: number[];
  answers: Record<string, AlchemixBoundAt>;
}
const F = JSON.parse(readFileSync(join(__dirname, "fixtures", "threshold-at-block.json"), "utf8")) as {
  capturedAt: string;
  riskLog: DolomiteRiskLog;
  dolomite: DoloFixture[];
  alchemix: AlxFixture[];
};

const picksOf = (events: readonly Ev[]) =>
  healthReadPicks(
    events.map((e) => ({ blockNumber: e.block, timestamp: e.ts })),
    HEALTH_READS_MAX,
  );

/** One collateral and one debt held flat from the first event's day to the
 *  last, priced 2 and 1: a timeline whose ratio moves with the line alone. */
function flatTimeline(events: readonly Ev[], coll: string, debt: string): FlowTimeline {
  const first = Math.floor(Math.min(...events.map((e) => e.ts)) / DAY_S);
  const last = Math.floor(Math.max(...events.map((e) => e.ts)) / DAY_S);
  return {
    buckets: [],
    days: [
      {
        day: first,
        events: 1,
        tick: "both",
        cum: {},
        balances: [
          { side: "collateral", asset: coll, symbol: "C", amount: 1 },
          { side: "debt", asset: debt, symbol: "D", amount: 1 },
        ],
        prices: [],
      },
      { day: last, events: 1, tick: "both", cum: {}, balances: [], prices: [] },
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    dailyPrices: { [coll]: [[first, 2]], [debt]: [[first, 1]] },
    today: last,
  };
}

/** The line each day from the view, and the line wanted: the latest read on
 *  or before the day, the first read before it. */
function checkLine(name: string, t: FlowTimeline, reads: readonly FactorRead[], source = DOLOMITE_HEALTH_SOURCE) {
  const hv = healthView(t, reads, { source });
  assert.ok(hv, `${name}: a view`);
  const pts = hv.health.level!.points;
  assert.ok(pts.length > 0);
  for (const [day, line, block] of pts) {
    const r = [...reads].reverse().find((x) => x.day <= day) ?? reads[0];
    assert.equal(line, r.line, `${name} day ${day}: the line is the read's in force`);
    assert.equal(block, r.block, `${name} day ${day}: at the read's block`);
  }
  const firstDay = pts[0][0];
  if (reads[0].day > firstDay)
    assert.equal(hv.health.sparseBefore, reads[0].day, `${name}: dotted before the first read`);
  else assert.equal(hv.health.sparseBefore, undefined, `${name}: nothing dotted`);
  return hv.health;
}

test("the fixtures carry both families", () => {
  assert.ok(F.dolomite.length >= 3);
  assert.ok(F.alchemix.length >= 4);
  assert.ok(F.riskLog.sets.length > 0);
});

for (const f of F.alchemix) {
  test(`alchemix ${f.name}: the picks, and the line at each pick's lower bound`, () => {
    const picks = picksOf(f.events);
    assert.deepEqual(
      picks.map((p) => p.blockNumber),
      f.picks,
    );
    const reads = picks.map((p) => {
      const a = f.answers[String(p.blockNumber)];
      assert.ok(a && a.lowerBound > 0, `${f.name}: an answer at ${p.blockNumber}`);
      assert.equal(a.block, p.blockNumber);
      return alchemixBoundRead(a, p.timestamp);
    });
    const t = flatTimeline(f.events, ALCHEMIX_MYT_KEY, ALCHEMIX_DEBT_KEY);
    const h = checkLine(f.name, t, reads, alchemixHealthSource(f.chain, "USDC", "mixUSDC"));
    // Collateralisation = 2 ÷ 1 on every day: the line alone moves.
    assert.ok(h.points.every((p) => Math.abs(p[1] - 2) < 1e-12));
    // No step in these lives: the bound has stood at one value, so no marker.
    const bounds = new Set(reads.map((r) => r.line));
    const changes = alchemixBoundChanges(h.level!.points, null, f.alchemist);
    assert.equal(changes.length, bounds.size - 1, `${f.name}: one marker per step`);
  });
}

test("alchemix: a stepped answer moves the line on the pick's day and draws its marker there", () => {
  const f = F.alchemix[0];
  const picks = picksOf(f.events);
  assert.ok(picks.length >= 3);
  const k = Math.floor(picks.length / 2);
  const reads = picks.map((p, i) =>
    alchemixBoundRead(
      { block: p.blockNumber, lowerBound: i >= k ? 1.1 : f.answers[String(p.blockNumber)].lowerBound },
      p.timestamp,
    ),
  );
  const h = checkLine("stepped", flatTimeline(f.events, ALCHEMIX_MYT_KEY, ALCHEMIX_DEBT_KEY), reads);
  const changes = alchemixBoundChanges(h.level!.points, null, f.alchemist);
  assert.equal(changes.length, 1);
  const c = changes[0];
  assert.equal(c.day, Math.floor(picks[k].timestamp / DAY_S));
  assert.equal(c.block, picks[k].blockNumber);
  assert.equal(c.name, "Lower bound");
  assert.equal(c.from, "105.3%");
  assert.equal(c.to, "110.0%");
  assert.match(c.prov.summary, /seen at the read at block/);
  // A step at today's card read is marked at the card's block.
  const today = alchemixBoundChanges(
    [...h.level!.points.slice(0, -1), [h.level!.points.at(-1)![0], 1.2, null]],
    999,
    null,
  );
  assert.equal(today.at(-1)!.block, 999);
  assert.match(today.at(-1)!.prov.summary, /the card's/);
});

for (const f of F.dolomite) {
  test(`dolomite ${f.name}: the picks, and the line at each pick's margin ratio for the account`, () => {
    const picks = picksOf(f.events);
    assert.deepEqual(
      picks.map((p) => p.blockNumber),
      f.picks,
    );
    const reads = picks.map((p) => {
      const a = f.answers[String(p.blockNumber)];
      assert.ok(a && a.marginRatioForAccount > 0, `${f.name}: an answer at ${p.blockNumber}`);
      const r = dolomiteRiskRead(a, p.timestamp);
      assert.equal(r.line, 1 + a.marginRatioForAccount);
      // The override skips the premiums.
      for (const [m, premium] of Object.entries(a.premiums)) {
        const p2 = a.overrideMarginRatio != null ? 0 : premium;
        assert.ok(Math.abs(r.lt[m] - 1 / ((1 + p2) * r.line!)) < 1e-12);
        assert.equal(r.dw?.[m], p2 > 0 ? 1 + p2 : undefined);
      }
      return r;
    });
    // The line's stepping on a flat pair: one collateral counted at
    // 1 ÷ line, so the ratio is 2 on every day and the line alone moves.
    const flat = reads.map((r) => ({ day: r.day, block: r.block, lt: { c: 1 / r.line!, d: 0 }, line: r.line }));
    const h = checkLine(f.name, flatTimeline(f.events, "c", "d"), flat);
    // Margin ratio = 2 ÷ 1 on every day.
    assert.ok(h.points.every((p) => Math.abs(p[1] - 2) < 1e-12));
    // The markers: each setter log that moved a value, on a market the account used.
    const changes = dolomiteRiskChanges(F.riskLog, new Map(Object.entries(f.markets)));
    for (const c of changes) {
      assert.ok(c.from != null && c.from !== c.to);
      if (c.name !== "Margin ratio") assert.ok(Object.values(f.markets).some((s) => c.name === `${s} margin premium`));
    }
    const first = Math.floor(Math.min(...f.events.map((e) => e.ts)) / DAY_S);
    const last = Math.floor(Math.max(...f.events.map((e) => e.ts)) / DAY_S);
    const inLife = changesByDay(changes, first, last).flatMap((d) => d.changes);
    // A premium step inside the life shows in the reads that straddle it.
    for (const c of inLife) {
      const m = Object.entries(f.markets).find(([, s]) => c.name === `${s} margin premium`)?.[0];
      if (!m) continue;
      const before = picks.filter((p) => p.blockNumber < c.block).at(-1);
      const after = picks.find((p) => p.blockNumber >= c.block);
      if (before && after)
        assert.notEqual(
          f.answers[String(before.blockNumber)].premiums[m],
          f.answers[String(after.blockNumber)].premiums[m],
          `${f.name}: ${c.name} moved between the reads`,
        );
    }
  });
}

test("dolomite: the core's setter logs give the one premium step of a listed market and no ratio step after launch", () => {
  const all = dolomiteRiskChanges(F.riskLog, new Map([["6", "weETH"]]));
  const weeth = all.filter((c) => c.name === "weETH margin premium");
  assert.deepEqual(
    weeth.map((c) => [c.block, c.from, c.to]),
    [[24_384_982, "6.25 %", "3.66 %"]],
  );
  const ratio = all.filter((c) => c.name === "Margin ratio");
  assert.deepEqual(
    ratio.map((c) => [c.block, c.from, c.to]),
    [[22_778_154, "15 %", "17.65 %"]],
  );
  // A market the account never used draws no marker.
  assert.equal(
    dolomiteRiskChanges(F.riskLog, new Map([["2", "USDC"]])).filter((c) => c.name !== "Margin ratio").length,
    0,
  );
});

test("dolomite override-step-0x0aaf: the line steps from 111.11 % to 117.65 % at the read that first shows the override gone", () => {
  const f = F.dolomite.find((x) => x.name === "override-step-0x0aaf")!;
  const picks = picksOf(f.events);
  const lines = picks.map((p) => +(1 + f.answers[String(p.blockNumber)].marginRatioForAccount).toFixed(4));
  assert.deepEqual(lines, [1.1111, 1.1765, 1.1765, 1.1765, 1.1765]);
  assert.equal(picks[1].blockNumber, 23_111_921);
  assert.equal(Math.floor(picks[1].timestamp / DAY_S), 20_310);
  // The override is the account's: no setter log moves it, so no marker.
  const changes = dolomiteRiskChanges(F.riskLog, new Map(Object.entries(f.markets)));
  const first = Math.floor(f.events[0].ts / DAY_S);
  assert.equal(changesByDay(changes, first, Math.floor(f.events.at(-1)!.ts / DAY_S)).length, 0);
});

test("dolomite weeth-premium-0x6c26: weETH's premium step is a marker inside the life; the override keeps the line", () => {
  const f = F.dolomite.find((x) => x.name === "weeth-premium-0x6c26")!;
  const changes = dolomiteRiskChanges(F.riskLog, new Map(Object.entries(f.markets)));
  const first = Math.floor(f.events[0].ts / DAY_S);
  const inLife = changesByDay(changes, first, Math.floor(f.events.at(-1)!.ts / DAY_S)).flatMap((d) => d.changes);
  assert.deepEqual(
    inLife.map((c) => [c.block, c.name, c.from, c.to]),
    [[24_384_982, "weETH margin premium", "6.25 %", "3.66 %"]],
  );
  assert.match(inLife[0].prov.summary, /skips the premiums/);
  const lines = new Set(f.picks.map((b) => f.answers[String(b)].marginRatioForAccount));
  assert.equal(lines.size, 1);
  assert.ok(f.picks.every((b) => f.answers[String(b)].overrideMarginRatio != null));
});

// ── Compound V2, Moonwell and Compound V3: the collateral factor changes ─────
//
// Fixtures (scripts/verify/fixtures/collateral-factor-changes.json, written by
// capture-collateral-factor-changes.mjs on the date it names): each
// position's factor reads as its page made them (the picks and the change
// blocks), the markers it drew, and each Comptroller's and Comet's setter log
// answer (/api/chain/ctoken-factor-log, /api/chain/compound/factor-log).
//
// Held: the markers are the log's changes inside the life on the markets the
// position used, the page's drawn markers; a change's block read gives the
// new factor and the read before it the old (a Comet's at the upgrade that
// carried it, the setter's block where it is not the upgrade's); the change
// blocks read are those after the first pick not covered by a pick on their
// day; with them the health factor steps on the change's day.

interface CfRead {
  block: number;
  ts: number;
  answer: { block: number; factors: Record<string, number | { liquidate: number }> };
}
interface CfPosition {
  name: string;
  family: "comet" | "ctoken";
  deployment?: CompoundDeploymentKey;
  market?: string;
  protocol?: CTokenProtocol;
  path: string;
  reads: CfRead[];
  life: [number, number];
  markers: { days: number[]; label: string }[];
}
const CF = JSON.parse(readFileSync(join(__dirname, "fixtures", "collateral-factor-changes.json"), "utf8")) as {
  capturedAt: string;
  logs: Record<string, CometFactorLog | CTokenFactorLog>;
  positions: CfPosition[];
};
const cfOf = (r: CfRead, key: string): number | undefined => {
  const v = r.answer.factors[key];
  return typeof v === "number" ? v : v?.liquidate;
};
const logOf = (p: CfPosition) => CF.logs[p.family === "comet" ? `${p.deployment}:${p.market}` : p.protocol!];
/** The markets the page's reads named, as the change functions take them:
 *  each one keyed and named by itself. */
function usedMarkets(p: CfPosition): Map<string, { asset: string; symbol: string }> {
  const keys = new Set(p.reads.flatMap((r) => Object.keys(r.answer.factors)));
  const out = new Map<string, { asset: string; symbol: string }>();
  for (const k of keys) {
    const addr =
      p.family === "comet"
        ? k
        : p.protocol === "compound-v2"
          ? COMPOUND_V2_MARKET_BY_KEY[k]?.ctoken
          : p.protocol === "moonwell"
            ? MOONWELL_MARKET_BY_KEY[k]?.mtoken
            : k;
    if (addr) out.set(addr.toLowerCase(), { asset: k, symbol: k });
  }
  return out;
}
const changesOf = (p: CfPosition): FactorChange[] => {
  const log = logOf(p);
  const all =
    p.family === "comet"
      ? cometFactorChanges(log as CometFactorLog, usedMarkets(p))
      : ctokenFactorChanges(log as CTokenFactorLog, usedMarkets(p), { comptroller: "Comptroller", via: "" });
  return changesByDay(all, p.life[0], p.life[1]).flatMap((d) => d.changes as FactorChange[]);
};

test("the collateral factor fixtures carry every family and chain", () => {
  const kinds = new Set(CF.positions.map((p) => p.deployment ?? p.protocol));
  for (const k of ["ethereum", "base", "arbitrum", "compound-v2", "moonwell", "moonwell-base"])
    assert.ok(kinds.has(k as never), k);
  for (const p of CF.positions) assert.ok(p.reads.length > 0, `${p.name}: reads`);
});

test("compound v3: each upgrade's step is the Configurator's setting it carried, and none at a listing", () => {
  const usdc = CF.logs["ethereum:usdc"] as CometFactorLog;
  const steps = cometFactorSteps(usdc).map((s) => [s.block, s.asset, factorPct(s.from), factorPct(s.to)]);
  assert.deepEqual(steps.slice(0, 2), [
    [19_317_537, "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "77 %", "85 %"],
    [19_760_918, "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", "81 %", "79 %"],
  ]);
  // Every step is an upgrade to an implementation the Configurator deployed.
  const deployed = new Set(usdc.configs.filter((c) => c.kind === "deploy").map((c) => c.impl));
  for (const s of cometFactorSteps(usdc)) {
    const u = usdc.upgrades.find((x) => x.block === s.block)!;
    assert.ok(deployed.has(u.impl));
    assert.ok(s.sets.length > 0, `${s.block}: carries a setter log`);
  }
  // A setting made but not yet deployed takes effect at the upgrade that
  // carries it: a synthetic set a block after an upgrade, deployed at the
  // next, steps there.
  const last = usdc.upgrades.at(-1)!;
  const synth: CometFactorLog = {
    ...usdc,
    configs: [
      ...usdc.configs,
      {
        block: last.block + 10,
        logIndex: 0,
        txHash: "0xset",
        kind: "set",
        asset: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        from: 0.88,
        to: 0.8,
      },
      { block: last.block + 50, logIndex: 0, txHash: "0xdep", kind: "deploy", impl: "0xnew" },
    ],
    upgrades: [
      ...usdc.upgrades,
      { block: last.block + 50, logIndex: 1, timestamp: last.timestamp + 600, txHash: "0xup", impl: "0xnew" },
    ],
  };
  const tail = cometFactorSteps(synth).at(-1)!;
  assert.deepEqual(
    [tail.block, factorPct(tail.from), factorPct(tail.to), tail.sets[0].block],
    [last.block + 50, "88 %", "80 %", last.block + 10],
  );
  // An upgrade to an implementation the Configurator did not build draws none.
  const stray: CometFactorLog = {
    ...synth,
    upgrades: [...usdc.upgrades, { ...synth.upgrades.at(-1)!, impl: "0xother" }],
  };
  assert.equal(cometFactorSteps(stray).length, cometFactorSteps(usdc).length);
});

test("compound v2 and moonwell: a market's first NewCollateralFactor is its listing and draws none", () => {
  for (const k of ["compound-v2", "moonwell", "moonwell-base"]) {
    const log = CF.logs[k] as CTokenFactorLog;
    const markets = new Map(log.sets.map((s) => [s.market, { asset: s.market, symbol: s.market }]));
    const changes = ctokenFactorChanges(log, markets, { comptroller: "Comptroller", via: "" });
    const firsts = new Set<string>();
    const firstBlocks = log.sets.filter((s) => (firsts.has(s.market) ? false : (firsts.add(s.market), true)));
    for (const f of firstBlocks)
      assert.ok(
        !changes.some((c) => c.asset === f.market && c.block === f.block && c.txHash === f.txHash),
        `${k} ${f.market}`,
      );
    for (const c of changes) assert.notEqual(c.from, c.to);
  }
  // Moonwell on Ethereum: every log is a listing.
  const mw = CF.logs["moonwell"] as CTokenFactorLog;
  assert.equal(
    ctokenFactorChanges(mw, new Map(mw.sets.map((s) => [s.market, { asset: s.market, symbol: "x" }])), {
      comptroller: "",
      via: "",
    }).length,
    0,
  );
});

for (const p of CF.positions) {
  test(`${p.name}: the markers, the reads at each change, and the step`, () => {
    const changes = changesOf(p);
    // The page drew these, day for day and value for value.
    const drawnDays = p.markers.flatMap((m) => m.days).sort((a, b) => a - b);
    assert.deepEqual(
      [...new Set(changes.map((c) => c.day))].sort((a, b) => a - b),
      drawnDays,
      `${p.name}: marker days`,
    );
    const labels = p.markers.map((m) => m.label).join(" | ");
    for (const c of changes)
      assert.ok(labels.includes(`${c.from} → ${c.to}`), `${p.name}: ${c.name} ${c.from} → ${c.to}`);
    // The change blocks read: the reads less the picks.
    const reads = [...p.reads].sort((a, b) => a.block - b.block);
    const changeBlocks = new Set(changes.map((c) => c.block));
    const picks = reads
      .filter((r) => !changeBlocks.has(r.block))
      .map((r) => ({ blockNumber: r.block, timestamp: r.ts }));
    const t = flatTimeline(
      reads.map((r) => ({ block: r.block, ts: r.ts })).concat([{ block: 0, ts: (p.life[0] + 0.5) * DAY_S }]),
      "c",
      "d",
    );
    // Every changed asset held as collateral with a debt across the life.
    const held = changes.map((c) => ({ ...c, asset: "c" }));
    const want = alsoPicks(picks, factorChangePicks(held, t)).map((x) => x.blockNumber);
    const read = reads
      .filter((r) => changeBlocks.has(r.block) && !picks.some((x) => x.blockNumber === r.block))
      .map((r) => r.block);
    for (const b of read) assert.ok(want.includes(b), `${p.name}: read ${b} is a change block after the first pick`);
    for (const c of changes) {
      const at = reads.find((r) => r.block === c.block);
      const prior = reads.filter((r) => r.block < c.block).at(-1);
      if (at) {
        const v = cfOf(at, c.asset);
        // A market not entered reads 0 on a Comptroller.
        if (v != null && (p.family === "comet" || v > 0))
          assert.equal(factorPct(v), c.to, `${p.name}: the read at ${c.block} gives ${c.name} ${c.to}`);
      }
      if (at && prior) {
        const v = cfOf(prior, c.asset);
        // A market not entered reads 0 on a Comptroller; skip it there.
        if (v != null && v > 0)
          assert.equal(factorPct(v), c.from, `${p.name}: the read before ${c.block} gives ${c.from}`);
      }
    }
    // With the change reads, a flat pair's health factor steps on the
    // change's day by the factor's ratio.
    const factorReads: FactorRead[] = reads.map((r) => ({
      day: Math.floor(r.ts / DAY_S),
      block: r.block,
      lt: { c: 0.5, d: 0 },
    }));
    for (const c of changes) {
      if (!read.includes(c.block)) continue;
      const fr = factorReads.map((r) =>
        r.block >= c.block ? { ...r, lt: { c: 0.5 * (parseFloat(c.to) / parseFloat(c.from!)), d: 0 } } : r,
      );
      const hv = healthView(t, fr, {});
      assert.ok(hv);
      const at = (d: number) => hv.health.points.find((x) => x[0] === d)?.[1];
      assert.ok(at(c.day - 1) != null && at(c.day) != null);
      assert.ok(
        Math.abs(at(c.day)! / at(c.day - 1)! - parseFloat(c.to) / parseFloat(c.from!)) < 1e-9,
        `${p.name}: the step on ${c.day}`,
      );
      assert.equal(hv.health.points.find((x) => x[0] === c.day)![2], c.block);
    }
  });
}
