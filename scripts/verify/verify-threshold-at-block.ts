// verify-threshold-at-block — the liquidation line read at each picked block
// on Alchemix V3 and Dolomite (lib/alchemix/flows-health.ts,
// lib/dolomite/flows-health.ts), the collateral factor changes of
// Compound V2, Moonwell and Compound V3 (lib/shared/collateral-factor-changes.ts),
// the threshold and e-mode changes of the Aave V3 family
// (lib/aave-v3/config-changes.ts), f(x)'s liquidation and rebalance ratio
// changes (lib/fx/ratio-log.ts), LlamaLend's discount and policy changes
// (lib/llamalend/config-log.ts), and MakerDAO's price feed changes
// (lib/makerdao/feed-log.ts; rails-ops ui-jobs 328 step 8,
// reference/lifetime-price-chart.md, the rows).
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
import { changesByDay, changeWords } from "@/lib/shared/flows-changes";
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
import { aaveConfigChanges, type AaveConfigChange, type AaveConfigLogAnswer } from "@/lib/aave-v3/config-changes";
import type { AaveFamilyEmodeSwitch } from "@/lib/aave-v3/account-switches";
import { FX_COLL_KEY, FX_LOG_HEALTH_SOURCE, FX_LOG_STEADY_SOURCE, fxLineReads } from "@/lib/fx/flows-health";
import {
  fxMergedReads,
  fxRatioChangeReads,
  fxRatioChanges,
  fxRatioSteps,
  fxRatiosAt,
  type FxRatioLog,
} from "@/lib/fx/ratio-log";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import {
  llamalendConfigChanges,
  llamalendConfigSteps,
  llamalendLifeHasDiscountChange,
  type LlamalendConfigLog,
  type LlamalendDiscountRow,
} from "@/lib/llamalend/config-log";
import { makerFeedChanges, makerLifeHasFeedChange, type MakerFeedLog } from "@/lib/makerdao/feed-log";
import { makerHealthSource } from "@/lib/makerdao/flows-health";

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

// ── The Aave V3 family: threshold and e-mode changes ─────────────────────────
//
// Fixtures (scripts/verify/fixtures/aave-config-changes.json, written by
// capture-aave-config-changes.mjs on the date it names): each Aave V3
// Ethereum, SparkLend, Aave V3 Base and Seamless position's position-state
// reads as its page made them (the picks and the change blocks, cut to their
// thresholds), its e-mode switches, the markers it drew, and each market's
// configurator log answer (/api/chain/aave-v3/config-log).
//
// Held (lib/aave-v3/config-changes.ts): the markers are the log's changes
// inside the life on the reserves the account held as collateral, the page's
// drawn markers; a change that moves the line, read at its block, gives the
// new threshold on each reserve it moves (the category's where the account is
// in e-mode on it) and the read before gives the old; a reserve change on a
// reserve the account's e-mode category covers asks no read; the change
// blocks read are changes that move the line.

interface AaveRead {
  route: string;
  block: number;
  ts: number;
  txHash: string;
  emode: number;
  categories: Record<string, { label: string | null; lt: number }>;
  reserves: {
    reserve: string;
    symbol: string | null;
    lt: number;
    inEmode: boolean;
    collateral: boolean;
    supplied: boolean;
    owed: boolean;
  }[];
}
interface AavePosition {
  name: string;
  market: string;
  wallet: string;
  path: string;
  switches: AaveFamilyEmodeSwitch[];
  reads: AaveRead[];
  life: [number, number];
  markers: { days: number[]; blocks: number[]; label: string }[];
}
const AF = JSON.parse(readFileSync(join(__dirname, "fixtures", "aave-config-changes.json"), "utf8")) as {
  capturedAt: string;
  logs: Record<string, AaveConfigLogAnswer>;
  positions: AavePosition[];
};
/** The threshold a read gives the account on a reserve, in basis points. */
const ltOfRead = (r: AaveRead, reserve: string): number | null => {
  const x = r.reserves.find((y) => y.reserve === reserve);
  if (!x || !x.collateral) return null;
  return r.emode > 0 && x.inEmode ? (r.categories[String(r.emode)]?.lt ?? null) : x.lt;
};
const bps = (printed: string) => Math.round(parseFloat(printed) * 100);
function aaveHeld(p: AavePosition): Map<string, { asset: string; symbol: string }> {
  const out = new Map<string, { asset: string; symbol: string }>();
  for (const r of p.reads)
    for (const x of r.reserves)
      if ((x.supplied || x.collateral) && !out.has(x.reserve))
        out.set(x.reserve, { asset: x.reserve, symbol: x.symbol ?? x.reserve });
  return out;
}
const aaveChangesOf = (p: AavePosition): AaveConfigChange[] =>
  changesByDay(aaveConfigChanges(AF.logs[p.market], aaveHeld(p), p.switches), p.life[0], p.life[1]).flatMap(
    (d) => d.changes as AaveConfigChange[],
  );

test("aave: the fixtures carry every market, a change read, an e-mode life and lives with none", () => {
  for (const m of ["core", "prime", "etherfi", "spark", "base", "seamless"]) assert.ok(AF.logs[m], m);
  assert.equal(AF.logs.base.source, "sieve");
  assert.equal(AF.logs.core.source, "store");
  for (const p of AF.positions) assert.ok(p.reads.length > 0, `${p.name}: reads`);
  const changed = AF.positions.filter((p) => aaveChangesOf(p).length > 0).map((p) => p.market);
  for (const m of ["core", "spark", "base", "seamless"]) assert.ok(changed.includes(m), `${m}: a life with a change`);
  assert.ok(
    AF.positions.some((p) => p.reads.some((r) => r.emode > 0) && aaveChangesOf(p).length > 0),
    "an e-mode life with a change",
  );
  for (const m of ["etherfi", "spark", "base", "seamless"])
    assert.ok(
      AF.positions.some((p) => p.market === m && aaveChangesOf(p).length === 0),
      `${m}: a life with none`,
    );
});

test("aave: a listing, an LTV-only set and a block that ends where it began draw none", () => {
  const core = AF.logs.core;
  const every = new Map<string, { asset: string; symbol: string }>();
  for (const l of core.logs) if ("asset" in l) every.set(l.asset, { asset: l.asset, symbol: l.asset.slice(0, 6) });
  const all = aaveConfigChanges(core, every, []);
  for (const c of all) assert.notEqual(c.from, c.to, `${c.block} ${c.name}`);
  // Each reserve's first CollateralConfigurationChanged is its listing.
  const seen = new Set<string>();
  for (const l of core.logs)
    if (l.kind === "collateral" && !seen.has(l.asset)) {
      seen.add(l.asset);
      assert.ok(
        !all.some((c) => c.block === l.block && c.assets.includes(l.asset)),
        `listing ${l.asset} at ${l.block}`,
      );
    }
  // Block 25,037,701 sets one reserve 75 % → 0.01 % → 75 % twice.
  assert.ok(!all.some((c) => c.block === 25_037_701), "the round trip");
  // An account in no e-mode sees no category change.
  assert.ok(!all.some((c) => c.name.startsWith("E-mode")));
});

test("aave: the v3.2 upgrade's re-emitted memberships and a membership change", () => {
  const core = AF.logs.core;
  const weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const held = new Map([[weth, { asset: weth, symbol: "WETH" }]]);
  // An account in category 1 from before the upgrade through it.
  const sw: AaveFamilyEmodeSwitch = {
    blockNumber: 20_000_000,
    timestamp: 0,
    txHash: "0x",
    logIndex: 0,
    fromId: 0,
    fromLabel: null,
    toId: 1,
    label: "ETH correlated",
    ltvBps: null,
    liquidationThresholdBps: null,
  };
  const at = aaveConfigChanges(core, held, [sw]).filter((c) => c.block === 20_920_979);
  assert.deepEqual(at, [], "the upgrade's memberships draw none");
  // A synthetic removal after the upgrade moves WETH to its own threshold.
  const last = core.logs.at(-1)!;
  const synth: AaveConfigLogAnswer = {
    ...core,
    logs: [
      ...core.logs,
      {
        ...last,
        block: last.block + 10,
        logIndex: 0,
        kind: "emode-collateral",
        asset: weth,
        categoryId: 1,
        collateral: false,
      },
    ],
  };
  const out = aaveConfigChanges(synth, held, [sw]).filter((c) => c.block === last.block + 10);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "WETH threshold in e-mode “ETH correlated”");
  assert.ok(out[0].moves);
  const reserveLt = [...core.logs].reverse().find((l) => l.kind === "collateral" && l.asset === weth) as { lt: number };
  assert.equal(out[0].to, factorPct(reserveLt.lt / 1e4));
});

for (const p of AF.positions) {
  test(`aave ${p.name}: the markers, the reads at each change, and the e-mode rule`, () => {
    const changes = aaveChangesOf(p);
    const drawnDays = [...new Set(p.markers.flatMap((m) => m.days))].sort((a, b) => a - b);
    assert.deepEqual(
      [...new Set(changes.map((c) => c.day))].sort((a, b) => a - b),
      drawnDays,
      `${p.name}: marker days`,
    );
    const labels = p.markers.map((m) => m.label).join(" | ");
    for (const c of changes)
      assert.ok(labels.includes(`${c.name} ${c.from} → ${c.to}`), `${p.name}: ${c.name} ${c.from} → ${c.to}`);
    const reads = [...p.reads].sort((a, b) => a.block - b.block);
    const byBlock = new Map(changes.map((c) => [c.block, c]));
    const firstPick = reads.find((r) => !byBlock.has(r.block))?.block ?? Infinity;
    for (const r of reads) {
      const c = byBlock.get(r.block);
      if (!c) continue;
      // A read at a change block is a change that moves the line, after the
      // first pick, or a pick that happens to share the block.
      if (r.txHash === c.txHash) {
        assert.ok(c.moves, `${p.name}: read at ${c.block} moves the line`);
        assert.ok(r.block > firstPick, `${p.name}: read at ${c.block} after the first pick`);
      }
    }
    for (const c of changes) {
      const at = reads.find((r) => r.block === c.block && r.txHash === c.txHash);
      const prior = reads.filter((r) => r.block < c.block).at(-1);
      if (!c.moves) {
        assert.ok(!at, `${p.name}: no read at ${c.block}, which moves nothing`);
        // The account's threshold on the reserve is its category's either side.
        const after = reads.find((r) => r.block > c.block);
        for (const a of c.assets)
          for (const r of [prior, after])
            if (r && r.emode > 0 && ltOfRead(r, a) != null)
              assert.equal(
                ltOfRead(r, a),
                r.categories[String(r.emode)].lt,
                `${p.name}: ${a} on the category's threshold`,
              );
        continue;
      }
      if (!at) continue;
      for (const a of c.assets) {
        const v = ltOfRead(at, a);
        if (v != null) assert.equal(v, bps(c.to), `${p.name}: the read at ${c.block} gives ${c.name} ${c.to}`);
        const w = prior ? ltOfRead(prior, a) : null;
        // A same-block set and reset leaves the read before on the old value.
        if (w != null && prior && prior.block < c.block)
          assert.equal(w, bps(c.from!), `${p.name}: the read before ${c.block} gives ${c.from}`);
      }
    }
  });
}

// ── f(x): the pools' liquidation and rebalance ratio changes ────────────────
//
// Fixture (scripts/verify/fixtures/fx-ratio-log.json, written by
// capture-fx-ratio-log.mjs on the date it names): each pool's setter log
// answer (/api/chain/fx/ratio-log), and per position its event blocks and
// times and the two ratios /api/chain/fx/event-state gives at each day's
// last event.
//
// Held (lib/fx/ratio-log.ts): the log's ratios in force at each event read's
// block are the read's; each pool's first set of each line is its
// initialisation and no marker; a set that moved a ratio inside the life is
// a marker with its before → after and, after the first event, one more read
// on its day at its block, so the line steps there also between events; a
// set that moved the bonus alone moves nothing.

interface FxPosition {
  name: string;
  pool: string;
  id: string;
  events: Ev[];
  reads: Record<string, { block: number; liquidateLine: string | null; rebalanceLine: string | null }>;
}
const XF = JSON.parse(readFileSync(join(__dirname, "fixtures", "fx-ratio-log.json"), "utf8")) as {
  capturedAt: string;
  logs: Record<string, FxRatioLog>;
  positions: FxPosition[];
};
const fxReadsOf = (p: FxPosition) => p.reads as unknown as Record<string, FxStateAt>;
const fxLife = (p: FxPosition): [number, number] => [
  Math.floor(p.events[0].ts / DAY_S),
  Math.floor(p.events[p.events.length - 1].ts / DAY_S),
];

test("fx: both pools' logs, each line set once at the pool's initialisation", () => {
  for (const pool of ["wsteth", "wbtc"]) {
    const log = XF.logs[pool];
    assert.ok(log && log.toBlock > log.fromBlock, pool);
    assert.equal(log.sets.filter((s) => s.line === "liquidate").length, 1, `${pool}: one liquidation set`);
    assert.equal(log.sets.filter((s) => s.line === "rebalance").length, 1, `${pool}: one rebalance set`);
    assert.deepEqual(fxRatioSteps(log), [], `${pool}: no change`);
    assert.deepEqual(fxRatiosAt(log, log.toBlock), { liquidate: 0.95, rebalance: 0.88 });
    assert.equal(fxRatiosAt(log, log.fromBlock), null, `${pool}: nothing in force before the first set`);
  }
  assert.ok(XF.positions.length >= 3);
});

for (const p of XF.positions) {
  test(`fx ${p.name}: the log's ratios are the event reads', no marker and no extra read`, () => {
    const log = XF.logs[p.pool];
    const eventReads = fxLineReads(p.events, fxReadsOf(p));
    assert.ok(eventReads && eventReads.length > 0, `${p.name}: event reads`);
    for (const r of eventReads) {
      const at = fxRatiosAt(log, r.block);
      assert.ok(at, `${p.name}: in force at ${r.block}`);
      assert.equal(r.line, at.liquidate, `${p.name} ${r.block}: liquidation ratio`);
      assert.equal(r.warn, at.rebalance, `${p.name} ${r.block}: rebalance ratio`);
    }
    const [first, last] = fxLife(p);
    assert.equal(changesByDay(fxRatioChanges(log, p.pool), first, last).length, 0, `${p.name}: no marker`);
    assert.deepEqual(fxRatioChangeReads(log, p.events[0].block), []);
    const merged = fxMergedReads(eventReads, []);
    assert.deepEqual(merged, eventReads);
    checkLine(p.name, flatTimeline(p.events, FX_COLL_KEY, "fxUSD"), merged, FX_LOG_STEADY_SOURCE);
  });
}

test("fx: a change between two events steps the line on its day and draws its marker; a bonus-only set and one before the life do neither", () => {
  const p = XF.positions.find((x) => x.events.length >= 4)!;
  const base = XF.logs[p.pool];
  // A day with no event between two event days.
  const evDays = new Set(p.events.map((e) => Math.floor(e.ts / DAY_S)));
  let gap: { block: number; ts: number } | null = null;
  for (let i = 1; i < p.events.length && !gap; i++) {
    const a = p.events[i - 1];
    const b = p.events[i];
    const midTs = Math.floor((a.ts + b.ts) / 2);
    if (!evDays.has(Math.floor(midTs / DAY_S)) && b.block - a.block > 2)
      gap = { block: Math.floor((a.block + b.block) / 2), ts: midTs };
  }
  assert.ok(gap, `${p.name}: a day with no event between two events`);
  const set = (
    block: number,
    ts: number,
    line: "liquidate" | "rebalance",
    debtRatio: number,
    bonusRatio: number,
    i: number,
  ) => ({
    block,
    timestamp: ts,
    txHash: `0x${String(i).repeat(64)}`,
    logIndex: i,
    line,
    debtRatio,
    bonusRatio,
  });
  const before = p.events[0];
  const log: FxRatioLog = {
    ...base,
    sets: [
      ...base.sets,
      set(before.block - 20_000, before.ts - 2 * DAY_S, "rebalance", 0.87, 0.025, 1),
      set(gap.block, gap.ts, "liquidate", 0.9, 0.04, 2),
      set(gap.block + 1, gap.ts + 12, "rebalance", 0.87, 0.03, 3),
    ],
  };
  const steps = fxRatioSteps(log);
  assert.deepEqual(
    steps.map((s) => [s.block, s.line, s.before, s.debtRatio]),
    [
      [before.block - 20_000, "rebalance", 0.88, 0.87],
      [gap.block, "liquidate", 0.95, 0.9],
    ],
    "the bonus-only set is no step",
  );
  const [first, last] = fxLife(p);
  const inLife = changesByDay(fxRatioChanges(log, "wstETH"), first, last).flatMap((d) => d.changes);
  assert.equal(inLife.length, 1, "one marker inside the life");
  assert.equal(`${inLife[0].name} ${inLife[0].from} → ${inLife[0].to}`, "Liquidation ratio 95 % → 90 %");
  assert.equal(inLife[0].day, Math.floor(gap.ts / DAY_S));
  assert.ok(inLife[0].prov.summary.includes("UpdateLiquidateRatios"));
  // The event reads as the chain would give them under this log.
  const eventReads = fxLineReads(p.events, fxReadsOf(p))!.map((r) => {
    const at = fxRatiosAt(log, r.block)!;
    return { ...r, lt: { [FX_COLL_KEY]: at.liquidate }, line: at.liquidate, warn: at.rebalance };
  });
  const changeReads = fxRatioChangeReads(log, p.events[0].block);
  assert.deepEqual(
    changeReads.map((r) => [r.block, r.line, r.warn]),
    [[gap.block, 0.9, 0.87]],
    "one read at the change after the first event, both lines in force after it",
  );
  const merged = fxMergedReads(eventReads, changeReads);
  const h = checkLine(
    `${p.name} (a change)`,
    flatTimeline(p.events, FX_COLL_KEY, "fxUSD"),
    merged,
    FX_LOG_HEALTH_SOURCE,
  );
  const pts = h.level!.points;
  const gapDay = Math.floor(gap.ts / DAY_S);
  assert.ok(
    pts.some(([d, v]) => d === gapDay && v === 0.9),
    "the line is 90 % on the change's day",
  );
  assert.ok(
    pts.some(([d, v]) => d < gapDay && v === 0.95),
    "and 95 % before it",
  );
  assert.ok(
    pts.filter(([d]) => d > gapDay).every(([, v]) => v === 0.9),
    "and 90 % after it",
  );
});

// ── LlamaLend: the markets' discount and policy changes ─────────────────────
//
// Fixture (scripts/verify/fixtures/llamalend-config-log.json, written by
// capture-llamalend-config-log.mjs on the date it names): each market's
// Controller setter logs (/api/chain/llamalend/config-log), and per position
// its rows with the discount each UserState stored, the event-state read at
// the last event of each day, and the same read at each discount change
// inside the life.
//
// Held (lib/llamalend/config-log.ts): each set that moved a discount or the
// policy is a step with its before → after, the first one's before the
// route's `before`; a change inside the life is a marker. The line does not
// step at a change: the stored discount each read gives is the row's, and at
// a change's block it is still the one the position stored before it; the
// position takes the new one at its owner's next event, which the liquidation
// discount marker's receipt names, or says it kept the old one.

interface LlPosition {
  name: string;
  controller: string;
  user: string;
  rows: { block: number; ts: number; discountRaw: string | null }[];
  reads: Record<string, { block: number; hasLoan: boolean; discountRaw: string | null; healthRaw: string | null }>;
  atChanges: Record<string, { block: number; hasLoan: boolean; discountRaw: string | null; healthRaw: string | null }>;
}
const LL = JSON.parse(readFileSync(join(__dirname, "fixtures", "llamalend-config-log.json"), "utf8")) as {
  capturedAt: string;
  logs: Record<string, LlamalendConfigLog>;
  positions: LlPosition[];
};
const llFrac = (raw: string | null) => (raw != null && BigInt(raw) > BigInt(0) ? Number(BigInt(raw)) / 1e18 : null);
const llRows = (p: LlPosition): LlamalendDiscountRow[] =>
  p.rows.map((r) => ({ block: r.block, ts: r.ts, discount: llFrac(r.discountRaw) }));
const llToday = Math.floor(Date.parse(LL.capturedAt) / 1000 / DAY_S);
const llLife = (p: LlPosition): [number, number] => {
  const last = p.rows[p.rows.length - 1];
  const open = last.discountRaw != null && BigInt(last.discountRaw) > BigInt(0);
  return [Math.floor(p.rows[0].ts / DAY_S), open ? llToday : Math.floor(last.ts / DAY_S)];
};
const llPos = (name: string) => LL.positions.find((p) => p.name === name)!;
const llWords = (c: { name: string; from: string | null; to: string }) => `${c.name} ${c.from} → ${c.to}`;
const llInLife = (p: LlPosition, log = LL.logs[p.controller]) => {
  const [first, last] = llLife(p);
  return changesByDay(llamalendConfigChanges(log, llRows(p), "test"), first, last).flatMap((d) => d.changes);
};

test("llamalend: the markets' steps, each with its value before", () => {
  const steps = (c: string) =>
    llamalendConfigSteps(LL.logs[c]).map((s) => [s.line, s.block, s.before, s.after] as const);
  assert.deepEqual(
    steps("0xa920de414ea4ab66b97da1bfe9e6eca7d4219635").filter(([l]) => l !== "policy"),
    [
      ["liquidation", 23_989_153, 0.06, 0.0921],
      ["loan", 23_989_153, 0.09, 0.1429],
    ],
  );
  assert.equal(steps("0xa920de414ea4ab66b97da1bfe9e6eca7d4219635").filter(([l]) => l === "policy").length, 3);
  assert.deepEqual(
    steps("0xeda215b7666936ded834f76f3fbc6f323295110a").filter(([l]) => l !== "policy"),
    [
      ["loan", 23_653_875, 0.11, 0.2],
      ["liquidation", 23_861_548, 0.08, 0.12],
      ["loan", 24_955_515, 0.2, 0.5],
      ["loan", 25_253_381, 0.5, 0.3],
    ],
  );
  assert.deepEqual(steps("0x8472a9a7632b173c8cf3a86d3afec50c35548e76"), [], "the first mint market has no set");
});

for (const p of LL.positions) {
  test(`llamalend ${p.name}: each read's stored discount is the row's, and a change's block leaves it where it was`, () => {
    const rows = llRows(p);
    const storedAt = (block: number) => [...rows].reverse().find((r) => r.block <= block)?.discount ?? null;
    for (const r of Object.values(p.reads)) {
      if (!r.hasLoan) continue;
      assert.equal(llFrac(r.discountRaw), storedAt(r.block), `${p.name} ${r.block}: the read's discount is the row's`);
      assert.ok(r.healthRaw != null, `${p.name} ${r.block}: a health`);
    }
    for (const r of Object.values(p.atChanges)) {
      if (!r.hasLoan) continue;
      assert.equal(llFrac(r.discountRaw), storedAt(r.block), `${p.name} ${r.block}: no step at the change`);
    }
  });
}

test("llamalend 0x6bda: the WETH market's 6 % → 9.21 % is a marker, the position taking it at its next borrow", () => {
  const p = llPos("0x6bda");
  const inLife = llInLife(p);
  const liq = inLife.filter((c) => c.name === "Liquidation discount");
  assert.deepEqual(liq.map(llWords), ["Liquidation discount 6 % → 9.21 %"]);
  assert.equal(liq[0].block, 23_989_153);
  assert.match(liq[0].prov.summary, /took 9\.21 % at its event at block 25,926,904/);
  assert.deepEqual(inLife.filter((c) => c.name === "Loan discount").map(llWords), ["Loan discount 9 % → 14.29 %"]);
  assert.deepEqual(
    inLife.filter((c) => c.name === "Rate policy replaced").map((c) => c.block),
    [24_290_603],
    "the policy swaps before the life draw none",
  );
  const [first, last] = llLife(p);
  assert.ok(llamalendLifeHasDiscountChange(inLife, first, last));
});

test("llamalend 0x3722 and 0x37b1: the CRV market's 8 % → 12 %, taken at a later borrow on one and kept to the close on the other", () => {
  const took = llInLife(llPos("0x3722"));
  assert.deepEqual(took.filter((c) => c.name !== "Rate policy replaced").map(llWords), [
    "Loan discount 11 % → 20 %",
    "Liquidation discount 8 % → 12 %",
    "Loan discount 20 % → 50 %",
    "Loan discount 50 % → 30 %",
  ]);
  assert.match(
    took.find((c) => c.name === "Liquidation discount")!.prov.summary,
    /took 12 % at its event at block 24,378,240/,
  );
  const kept = llInLife(llPos("0x37b1"));
  assert.deepEqual(
    kept.map(llWords),
    ["Loan discount 11 % → 20 %", "Liquidation discount 8 % → 12 %"],
    "the changes after the close draw none",
  );
  assert.match(kept[1].prov.summary, /kept 8 % through the rest of this history/);
});

test("llamalend 0x1109: no set in the life draws no marker; a synthetic change inside it draws one", () => {
  const p = llPos("0x1109");
  const log = LL.logs[p.controller];
  assert.deepEqual(llInLife(p), []);
  const [first, last] = llLife(p);
  assert.equal(llamalendLifeHasDiscountChange(llInLife(p), first, last), false);
  const a = p.rows[2];
  const b = p.rows[3];
  const mid = { block: Math.floor((a.block + b.block) / 2), ts: Math.floor((a.ts + b.ts) / 2) };
  const synthetic: LlamalendConfigLog = {
    ...log,
    before: { discounts: { block: mid.block - 1, loanDiscount: 0.09, liquidationDiscount: 0.06 }, policy: null },
    sets: [
      {
        block: mid.block,
        timestamp: mid.ts,
        txHash: `0x${"1".repeat(64)}`,
        logIndex: 1,
        kind: "discounts",
        loanDiscount: 0.09,
        liquidationDiscount: 0.045,
      },
      {
        block: b.block + 10_000,
        timestamp: b.ts + 2 * DAY_S,
        txHash: `0x${"2".repeat(64)}`,
        logIndex: 1,
        kind: "discounts",
        loanDiscount: 0.1,
        liquidationDiscount: 0.045,
      },
    ],
  };
  const inLife = llInLife(p, synthetic);
  assert.deepEqual(
    inLife.map(llWords),
    ["Liquidation discount 6 % → 4.5 %"],
    "the loan-only set after the close is outside the life",
  );
  assert.equal(inLife[0].day, Math.floor(mid.ts / DAY_S));
  assert.match(inLife[0].prov.summary, /kept 6 % through the rest of this history/);
  assert.ok(llamalendLifeHasDiscountChange(inLife, first, last));
});

test("llamalend 0x6bda: the policy swap in the life names each side's kind, setting and address", () => {
  const [c] = llInLife(llPos("0x6bda")).filter((x) => x.name === "Rate policy replaced");
  assert.equal(c.from, "Aggregate, base 9.9 %");
  assert.equal(c.to, "Aggregate, base 11.55 %");
  assert.equal(c.fromLink?.href, "https://etherscan.io/address/0x8c5a7f011f733fbb0a6c969c058716d5ce9bc933");
  assert.equal(c.toLink?.href, "https://etherscan.io/address/0x07491d124ddb3ef59a8938fcb3ee50f9fa0b9251");
  assert.equal(
    changeWords(c),
    "Rate policy replaced Aggregate, base 9.9 % (0x8c5a…c933) → Aggregate, base 11.55 % (0x0749…9251)",
  );
  assert.deepEqual(
    c.prov.inputs?.map((i) => [i.label, i.contract?.address]),
    [
      ["Policy replaced", "0x8c5a7f011f733fbb0a6c969c058716d5ce9bc933"],
      ["New policy", "0x07491d124ddb3ef59a8938fcb3ee50f9fa0b9251"],
    ],
  );
});

test("llamalend: each policy kind on the fixture's markets reads by its main setting", () => {
  const words = (c: string) =>
    llamalendConfigChanges(LL.logs[c], [], "test")
      .filter((x) => x.name === "Rate policy replaced")
      .map((x) => `${x.from} → ${x.to}`);
  assert.deepEqual(words("0x1e0165dbd2019441ab7927c018701f3138114d71"), [
    "Semi-log, 0.1–55 % → Secondary, target 85 %",
    "Secondary, target 85 % → Semi-log, 0.1–70 %",
    "Semi-log, 0.1–70 % → Semi-log, 10–100 %",
  ]);
  assert.deepEqual(words("0xb536fea3a01c95dd09932440ec802a75410139d6"), [
    "Semi-log, 1–40 % → sUSDe-tracking, target 85 %",
    "sUSDe-tracking, target 80 % → Semi-log, 0–47.66 %",
    "Semi-log, 0–47.66 % → Yield-tracking, target 85 %",
  ]);
  assert.deepEqual(words("0xeda215b7666936ded834f76f3fbc6f323295110a"), [
    "Semi-log, 1–80 % → Semi-log, 0.03–466.56 %",
    "Semi-log, 0–293.3 % → Semi-log, 0 %",
  ]);
});

test("llamalend: a policy whose kind was not told is its address alone, linked", () => {
  const log = LL.logs["0x1e0165dbd2019441ab7927c018701f3138114d71"];
  const blind: LlamalendConfigLog = {
    ...log,
    sets: log.sets.map((s) =>
      s.kind === "policy" && s.policies
        ? {
            ...s,
            policies: { before: s.policies.before && { ...s.policies.before, kind: null }, after: s.policies.after },
          }
        : s,
    ),
  };
  const [c] = llamalendConfigChanges(blind, [], "test").filter((x) => x.name === "Rate policy replaced");
  assert.equal(c.from, "0x112e…af02");
  assert.equal(c.fromLink?.text, "0x112e…af02");
  assert.equal(changeWords(c), "Rate policy replaced 0x112e…af02 → Secondary, target 85 % (0x319c…778f)");
});

// ── MakerDAO: the ilks' price feed changes ──────────────────────────────────
//
// Fixture (scripts/verify/fixtures/maker-feed-log.json, written by
// capture-maker-feed-log.mjs on the date it names): each ilk's feed log
// (/api/chain/makerdao/feed-log), and per vault its rows' blocks and times,
// whether it is open, and the daily store's closes of `maker:<ILK>`.
//
// Held (lib/makerdao/feed-log.ts): each pip after the ilk's first, each OSM
// source change, each cap set after its feed's filing and each par file is a
// marker inside the life, named by the chainlog key or the source's kind and
// wat(); the line takes the change from the store's close, which on each
// change day is an observation, so no read is added.

interface MkVault {
  name: string;
  vault: string;
  ilk: string;
  open: boolean;
  rows: { block: number; ts: number }[];
  closes: [number, number][];
}
const MK = JSON.parse(readFileSync(join(__dirname, "fixtures", "maker-feed-log.json"), "utf8")) as {
  capturedAt: string;
  logs: Record<string, MakerFeedLog>;
  vaults: MkVault[];
};
const mkToday = Math.floor(Date.parse(MK.capturedAt) / 1000 / DAY_S);
const mkLife = (v: MkVault): [number, number] => [
  Math.floor(v.rows[0].ts / DAY_S),
  v.open ? mkToday : Math.floor(v.rows[v.rows.length - 1].ts / DAY_S),
];
const mkVault = (name: string) => MK.vaults.find((v) => v.name === name)!;
const mkWords = (c: { name: string; from: string | null; to: string }) =>
  c.from != null ? `${c.name} ${c.from} → ${c.to}` : `${c.name} set to ${c.to}`;
const mkInLife = (v: MkVault, log = MK.logs[v.ilk]) => {
  const [first, last] = mkLife(v);
  return changesByDay(makerFeedChanges(log), first, last).flatMap((d) => d.changes);
};

test("maker: the ilks' feed logs, each source and feed named from the chain, no par file", () => {
  const eth = MK.logs["ETH-A"];
  assert.deepEqual(
    eth.feeds.map((f) => [f.name, f.kind, f.src?.kind, f.src?.wat]),
    [["PIP_ETH", "osm", "median", "ETHUSD"]],
  );
  assert.deepEqual(
    eth.sources.map((s) => [s.block, s.from?.wat, s.to.kind, s.to.wat]),
    [[22_117_224, "ETHUSD", "chronicle", "ETH/USD"]],
  );
  assert.deepEqual(
    MK.logs["WBTC-A"].sources.map((s) => [s.block, s.from?.wat, s.to.wat]),
    [[21_616_020, "BTCUSD", "BTC/USD"]],
  );
  const sky = MK.logs["LSEV2-SKY-A"];
  assert.deepEqual(
    sky.feeds.map((f) => [f.block, f.name, f.kind, f.cap]),
    [
      [22_517_471, "PIP_SKY", "osm", null],
      [23_534_264, "LOCKSTAKE_ORACLE", "capped", 0.04],
    ],
  );
  assert.deepEqual(
    sky.caps.map((c) => [c.block, c.from, c.to]),
    [[24_018_461, 0.04, 0.025]],
    "the filing's cap set draws none",
  );
  const lp = MK.logs["UNIV2USDCETH-A"];
  assert.deepEqual(
    lp.feeds.map((f) => [f.block, f.name, f.kind]),
    [
      [11_734_776, "PIP_UNIV2USDCETH", "lp"],
      [12_503_924, "PIP_UNIV2USDCETH", "lp"],
    ],
  );
  for (const log of Object.values(MK.logs)) assert.deepEqual(log.pars, [], `${log.ilk}: par never filed`);
});

test("maker: each vault's feed changes in its life, named; none on the lives without one", () => {
  const want: Record<string, string[]> = {
    "2028": ["OSM source Median ETHUSD → Chronicle ETH/USD"],
    "31489": ["OSM source Median BTCUSD → Chronicle BTC/USD"],
    "0x6a01": ["Price feed PIP_SKY (OSM, SKY/USD) → LOCKSTAKE_ORACLE (capped at $0.04)", "Price cap $0.04 → $0.025"],
    "23227": ["Price feed PIP_UNIV2USDCETH 0xecb0…72be → PIP_UNIV2USDCETH 0xf751…e52a"],
    "31951": [],
    "0x365f": [],
  };
  for (const v of MK.vaults) {
    const inLife = mkInLife(v);
    assert.deepEqual(inLife.map(mkWords), want[v.name], v.name);
    const [first, last] = mkLife(v);
    assert.equal(
      makerLifeHasFeedChange(inLife, first, last),
      want[v.name].length > 0,
      `${v.name}: the how-to-read's flag`,
    );
    for (const c of inLife) assert.equal(c.prov.kind, "chain", `${v.name}: ${c.name} stands in a chain receipt`);
  }
  const help = (on: boolean) => makerHealthSource(on).ratio!.help;
  assert.match(help(true), /a grey diamond on the events row, reaches the ratio through the OSM price/);
  assert.doesNotMatch(help(false), /grey diamond/);
});

test("maker 0x6a01: the store's close steps on the feed's and the cap's days, so the ratio steps with no read added", () => {
  const v = mkVault("0x6a01");
  const close = new Map(v.closes);
  const day = (block: number) =>
    Math.floor(MK.logs["LSEV2-SKY-A"].feeds.concat().find((f) => f.block === block)!.timestamp / DAY_S);
  const pipDay = day(23_534_264);
  const capDay = Math.floor(MK.logs["LSEV2-SKY-A"].caps[0].timestamp / DAY_S);
  assert.ok(close.get(pipDay - 1)! > 0.04, `the day before the new feed, the OSM's price ${close.get(pipDay - 1)}`);
  assert.equal(close.get(pipDay), 0.04, "the new feed's day closes at its cap");
  assert.equal(close.get(capDay - 1), 0.04);
  assert.equal(close.get(capDay), 0.025, "the cap's day closes at the new cap");
  // Every change day in every life is a close the chart draws.
  for (const w of MK.vaults)
    for (const c of mkInLife(w)) assert.ok(new Map(w.closes).has(c.day), `${w.name}: a close on ${c.day} (${c.name})`);
});

test("maker 31951: a synthetic source change and par file inside the life draw markers; a cap set before it draws none", () => {
  const v = mkVault("31951");
  const log = MK.logs["ETH-A"];
  const a = v.rows[3];
  const b = v.rows[4];
  const mid = { block: Math.floor((a.block + b.block) / 2), timestamp: Math.floor((a.ts + b.ts) / 2) };
  const at = (n: number, o: { block: number; timestamp: number }) => ({
    ...o,
    txHash: `0x${String(n).repeat(64)}`,
    logIndex: 1,
  });
  const scribe = log.sources[0].to;
  const synthetic: MakerFeedLog = {
    ...log,
    sources: [
      ...log.sources,
      {
        ...at(1, mid),
        osm: log.feeds[0].pip,
        pip: log.feeds[0].pip,
        from: scribe,
        to: { ...scribe, address: `0x${"ab".repeat(20)}` },
      },
    ],
    caps: [
      {
        ...at(2, { block: v.rows[0].block - 50_000, timestamp: v.rows[0].ts - 9 * DAY_S }),
        pip: log.feeds[0].pip,
        from: 0.04,
        to: 0.03,
      },
    ],
    pars: [{ ...at(3, { block: mid.block + 1, timestamp: mid.timestamp + 12 }), par: 1.02 }],
  };
  const inLife = mkInLife(v, synthetic);
  assert.deepEqual(inLife.map(mkWords), [
    `OSM source Chronicle ETH/USD 0x46ef…7f4e → Chronicle ETH/USD 0xabab…abab`,
    "Target price $1 → $1.02",
  ]);
  assert.equal(inLife[0].day, Math.floor(mid.timestamp / DAY_S));
  const [first, last] = mkLife(v);
  assert.ok(makerLifeHasFeedChange(inLife, first, last));
});
