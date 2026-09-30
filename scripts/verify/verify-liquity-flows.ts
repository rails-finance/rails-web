// verify-liquity-flows — a Liquity-family Trove's Lifetime flows
// (lib/shared/liquity-flows.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "The Liquity family").
// ----------------------------------------------------------------------------
// OFFLINE. Fixtures read on 30 Sep 2026: three Liquity V2 Troves from
// /api/trove/…/timeline (a WETH Trove redeemed 320 times, an rETH Trove
// redeemed and then liquidated with a surplus to claim, a wstETH batch member
// redeemed to a zombie), and the raw index rows of an Ebisu weETH Trove one
// of whose touches applied a redistribution (V2 has recorded none), run
// through the page's own transform (buildEbisuTimeline).
//
// Held: the replay's token totals meet the last recorded balances on both
// sides; the interest is never negative; and at every event day, a few days
// between, and the live stop, each side's printed lines add to its printed
// total, the remainder named for what it holds.
//
//   npx tsx --test scripts/verify/verify-liquity-flows.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isEbisuEvent } from "@/lib/shared/types/event-shape";
import {
  LQ,
  liquityFlowTimeline,
  liquityForkFlowEvents,
  liquityV2FlowEvents,
  replayLiquity,
  type LiquityFlowEvent,
} from "@/lib/shared/liquity-flows";
import { troveLives } from "@/lib/shared/liquity-flows-explanation";
import { buildFlowModel, stateAt, type FlowModel } from "@/lib/shared/flows-timeline";
import { sideSumRows } from "@/lib/shared/flows-sum";
import { binInputFromTimeline, binSeries } from "@/lib/shared/flows-series";
import { buildEbisuTimeline, type MvRow } from "@/lib/sources/api/ebisu-timeline";

const FIX = join(__dirname, "fixtures");
const read = (name: string) => JSON.parse(readFileSync(join(FIX, name), "utf8"));

const v2 = (name: string): BaseActivityEvent[] => read(name).events as BaseActivityEvent[];
const REDEEMED = liquityV2FlowEvents(v2("liquity-flows-v2-redeemed.json"));
const LIQUIDATED = liquityV2FlowEvents(v2("liquity-flows-v2-liquidated.json"));
const ZOMBIE = liquityV2FlowEvents(v2("liquity-flows-v2-zombie.json"));
const ebisuRaw = read("liquity-flows-ebisu-redist.json") as { rows: MvRow[]; collateralType: string; troveId: string };
const EBISU = liquityForkFlowEvents(
  buildEbisuTimeline(ebisuRaw.rows, ebisuRaw.collateralType, ebisuRaw.troveId).events,
  isEbisuEvent,
);

/** A fixed clock: noon on 30 Sep 2026. */
const NOW = Date.UTC(2026, 8, 30, 12) / 1000;

const SIDE_BUCKETS = {
  collateral: {
    in: [LQ.deposited, LQ.redistColl],
    out: [LQ.withdrawn, LQ.collRedeemed, LQ.collLiquidated, LQ.surplus],
  },
  debt: {
    in: [LQ.borrowed, LQ.interest, LQ.upfront, LQ.batchFee, LQ.redistDebt],
    out: [LQ.repaid, LQ.debtRedeemed, LQ.debtLiquidated],
  },
} as const;

function totals(events: LiquityFlowEvent[]) {
  const t: Record<string, number> = {};
  let negativeInterest = 0;
  for (const r of replayLiquity(events))
    for (const l of r.legs) {
      t[l.bucket] = (t[l.bucket] ?? 0) + l.amount;
      if ((l.bucket === LQ.interest || l.bucket === LQ.batchFee) && l.amount < -1e-9) negativeInterest++;
    }
  const net = (side: "collateral" | "debt") =>
    SIDE_BUCKETS[side].in.reduce((a, k) => a + (t[k] ?? 0), 0) -
    SIDE_BUCKETS[side].out.reduce((a, k) => a + (t[k] ?? 0), 0);
  return { t, negativeInterest, coll: net("collateral"), debt: net("debt") };
}

function model(events: LiquityFlowEvent[], symbols: [string, string], open: boolean, price = 4000): FlowModel {
  const t = liquityFlowTimeline(events, {
    collSymbol: symbols[0],
    debtSymbol: symbols[1],
    surplusClaimed: false,
    now: NOW,
    live: open ? { price } : null,
  });
  assert.ok(t, "a timeline");
  const m = buildFlowModel(t);
  assert.ok(m, "a model");
  return m;
}

/** Every event day, the days between two of them, and the live stop. */
function cursorStops(m: FlowModel): number[] {
  const stops = new Set<number>([...m.eventDays, m.liveStop]);
  for (let i = 1; i < m.eventDays.length; i++) {
    const gap = m.eventDays[i] - m.eventDays[i - 1];
    if (gap > 2) stops.add(m.eventDays[i - 1] + Math.floor(gap / 2));
  }
  return [...stops].sort((a, b) => a - b);
}

function assertSumsAdd(m: FlowModel, label: string) {
  for (const stop of cursorStops(m)) {
    const st = stateAt(m, stop);
    for (const side of ["collateral", "debt"] as const) {
      const rows = sideSumRows(st[side]);
      const printed = rows.lines.reduce((a, l) => a + l.dollars, 0);
      assert.equal(printed, rows.total.dollars, `${label} ${side} at stop ${stop}: lines add to the total`);
      const rest = rows.lines.find((l) => l.kind === "rest");
      if (rest)
        assert.equal(
          rest.label,
          side === "collateral" ? "Market move" : "Interest since the last event",
          `${label} ${side}: the remainder is named`,
        );
    }
  }
}

for (const [name, events, symbols, open] of [
  ["V2 WETH, redeemed", REDEEMED, ["WETH", "BOLD"], true],
  ["V2 rETH, liquidated", LIQUIDATED, ["rETH", "BOLD"], false],
  ["V2 wstETH, zombie", ZOMBIE, ["wstETH", "BOLD"], true],
  ["Ebisu weETH, redistribution", EBISU, ["weETH", "ebUSD"], true],
] as const) {
  test(`${name}: the replay meets the last recorded balances`, () => {
    const { coll, debt, negativeInterest } = totals(events as LiquityFlowEvent[]);
    const last = replayLiquity(events as LiquityFlowEvent[]).at(-1)!.ev;
    assert.ok(
      Math.abs(coll - last.collAfter) < 1e-9 * Math.max(1, last.collAfter),
      `collateral ${coll} vs ${last.collAfter}`,
    );
    assert.ok(Math.abs(debt - last.debtAfter) < 1e-6, `debt ${debt} vs ${last.debtAfter}`);
    assert.equal(negativeInterest, 0, "no event states negative interest");
  });
  test(`${name}: at every stop each side's printed lines add to its printed total`, () => {
    assertSumsAdd(model(events as LiquityFlowEvent[], symbols as unknown as [string, string], open), name);
  });
}

test("V2 WETH, redeemed: the redemptions sit on both bars, linked", () => {
  const m = model(REDEEMED, ["WETH", "BOLD"], true);
  const st = stateAt(m, m.liveStop);
  const coll = st.collateral.bar.find((s) => s.key === LQ.collRedeemed);
  const debt = st.debt.bar.find((s) => s.key === LQ.debtRedeemed);
  assert.ok(coll && coll.value > 0 && coll.link === "redemption" && coll.tone === "redemption");
  assert.ok(debt && debt.value > 0 && debt.link === "redemption");
  assert.equal(totals(REDEEMED).t[LQ.redistColl] ?? 0, 0);
});

test("V2 rETH, liquidated: the liquidation and its surplus leave the collateral whole", () => {
  const { t } = totals(LIQUIDATED);
  assert.ok((t[LQ.collLiquidated] ?? 0) > 0, "collateral liquidated");
  assert.ok((t[LQ.surplus] ?? 0) > 0, "a surplus to claim");
  assert.ok((t[LQ.debtLiquidated] ?? 0) > 0, "debt liquidated");
  const m = model(LIQUIDATED, ["rETH", "BOLD"], false);
  const end = stateAt(m, m.liveStop);
  assert.equal(Math.round(end.collateral.now), 0, "nothing held after the liquidation");
  assert.equal(Math.round(end.debt.now), 0, "nothing owed");
  assert.equal(m.liveStop, m.lastDay + 1, "a closed Trove's slider stops the day after its last event");
});

test("V2 wstETH, zombie: still holds its collateral, with the batch's fee on its own line", () => {
  const m = model(ZOMBIE, ["wstETH", "BOLD"], true);
  const end = stateAt(m, m.liveStop);
  assert.ok(end.collateral.now > 0, "a zombie still holds collateral");
  assert.ok((totals(ZOMBIE).t[LQ.batchFee] ?? 0) > 0, "a batch member pays the batch's fee");
  assert.equal(troveLives(replayLiquity(ZOMBIE).map((r) => r.ev)), 1);
});

test("Ebisu weETH: the redistribution is its own line on each side", () => {
  const { t } = totals(EBISU);
  assert.ok((t[LQ.redistColl] ?? 0) > 0, "redistribution gains");
  assert.ok((t[LQ.redistDebt] ?? 0) > 0, "redistributed debt");
  const m = model(EBISU, ["weETH", "ebUSD"], true);
  const rows = sideSumRows(stateAt(m, m.liveStop).debt);
  assert.ok(rows.lines.some((l) => l.label === "Redistributed debt"));
});

test("between events the debt grows by the interest its rate builds, and the line carries the last price", () => {
  const m = model(REDEEMED, ["WETH", "BOLD"], true);
  // A stop between two events a week or more apart.
  let at = -1;
  for (let i = 1; i < m.eventDays.length && at < 0; i++)
    if (m.eventDays[i] - m.eventDays[i - 1] >= 7) at = m.eventDays[i - 1] + 5;
  assert.ok(at > 0, "a quiet week");
  const before = stateAt(m, at - 4).debt.now;
  const after = stateAt(m, at).debt.now;
  assert.ok(after > before, "the debt grows between events");
  const t = liquityFlowTimeline(REDEEMED, {
    collSymbol: "WETH",
    debtSymbol: "BOLD",
    surplusClaimed: false,
    now: NOW,
    live: { price: 4000 },
  })!;
  const series = binSeries(binInputFromTimeline(t)!, "week")!;
  assert.equal(series.gaps.length, 0, "the line carries the last recorded price: no gaps");
});
