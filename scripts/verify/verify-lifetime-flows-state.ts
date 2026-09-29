// verify-lifetime-flows-state — the date scrubber's state(day) against the
// design brief's reconciliation table and the Lifetime flows ledger
// (rails-ops TO-DO-ui-jobs §141).
// ----------------------------------------------------------------------------
// OFFLINE. The fixture is the index's answer for Aave V3 Core wallet
// 0xfb9395e0…2a71 (whole history, 63 events), so the ledger
// (computeAaveV3Economics), the adapter (aaveV3FlowTimeline) and the model
// (buildFlowModel / stateAt) all run on the rows the page runs on.
//
//   npx tsx --test scripts/verify/verify-lifetime-flows-state.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionView } from "@/components/protocol/aave-v3/aave-v3-position-card";
import type { AaveLaneInterest } from "@/lib/aave-v3/lane-interest";
import { computeAaveV3Economics } from "@/lib/aave-v3/chain-truth-tower";
import { aaveV3FlowTimeline } from "@/lib/aave-v3/flows-timeline";
import {
  axisFor,
  buildFlowModel,
  dayStart,
  formatFlowUsd,
  nextEventDay,
  prevEventDay,
  stateAt,
  type FlowModel,
  type FlowSideState,
} from "@/lib/shared/flows-timeline";
import { formatDate } from "@/lib/date";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/verify/fixtures/lifetime-flows-aave-v3-fb93.json"), "utf8"),
) as { events: BaseActivityEvent[]; view: AaveV3PositionView; laneInterest: AaveLaneInterest[] };

const tower = computeAaveV3Economics(fixture.view, fixture.events, undefined, undefined, fixture.laneInterest);
const timeline = aaveV3FlowTimeline(fixture.events, tower, fixture.view.priceByAddress);
assert.ok(timeline, "the adapter draws this position");
const model = buildFlowModel(timeline) as FlowModel;
assert.ok(model);

const seg = (s: FlowSideState, key: string) => [...s.bar, ...s.sources].find((x) => x.key === key)?.value ?? 0;
/** To the brief's precision: $k with one decimal. */
const k1 = (v: number) => Math.round(v / 100) / 10;
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;
const dayOf = (iso: string) => Math.floor((Date.parse(iso) - model.start) / 86_400_000);
const usdSum = (xs: { usd: number | null }[] | undefined) => (xs ?? []).reduce((s, x) => s + (x.usd ?? 0), 0);

test("the live stop meets the brief's reconciliation table", () => {
  const s = stateAt(model, model.liveStop);
  assert.equal(s.count, 63);
  assert.equal(k1(seg(s.collateral, "deposited")), 79.3);
  assert.equal(k1(seg(s.collateral, "received")), 110.0);
  assert.equal(k1(seg(s.collateral, "withdrawn")), 25.8);
  assert.equal(k1(seg(s.collateral, "soldToRepay")), 1.1);
  assert.equal(k1(seg(s.collateral, "withdrawnSwapped")), 57.3);
  assert.equal(k1(seg(s.collateral, "sent")), 5.5);
  assert.equal(k1(seg(s.debt, "borrowed")), 82.8);
  // The brief's Repaid includes the repay with collateral; the bar draws it
  // as its own segment, linked to "Sold to repay".
  assert.equal(k1(seg(s.debt, "repaid") + seg(s.debt, "repaidWithCollateral")), 51.1);
  assert.equal(k1(seg(s.debt, "repaidWithCollateral")), 1.1);
  // Held and owed are live, so they follow prices: the brief's 210.8k and
  // 37.2k were read at other prices. The fixture's read gives these.
  assert.equal(k1(s.collateral.now), 211.5);
  assert.equal(k1(s.debt.now), 37.0);
});

test("the live stop states the ledger's figures", () => {
  const s = stateAt(model, model.liveStop);
  const c = tower.collateral;
  const d = tower.debt;
  assert.ok(near(s.collateral.now, usdSum(c.current)));
  assert.ok(near(s.debt.now, usdSum(d.current) + (d.interest?.usd ?? 0)));
  assert.ok(near(seg(s.collateral, "deposited"), c.lifetimeInflow));
  assert.ok(near(seg(s.collateral, "received"), usdSum(c.received)));
  assert.ok(near(seg(s.collateral, "collateral-interest"), usdSum(c.earned)));
  assert.ok(near(seg(s.collateral, "collateral-price"), c.priceChange?.usd ?? NaN, 0.5));
  assert.ok(near(s.collateral.out, usdSum(c.exited) + usdSum(c.liquidated)));
  assert.ok(near(seg(s.debt, "borrowed"), d.lifetimeInflow));
  assert.ok(near(seg(s.debt, "debt-interest"), (d.interest?.usd ?? 0) + usdSum(d.earned)));
  assert.ok(near(seg(s.debt, "debt-price"), d.priceChange?.usd ?? NaN, 0.5));
  assert.ok(near(s.debt.out, usdSum(d.exited) + usdSum(d.liquidated)));
  // The brief's prototype read 5.5k of debt interest off the balancing item;
  // the ledger's method gives 5.2k.
  assert.equal(formatFlowUsd(seg(s.debt, "debt-interest")), "$5.2k");
});

test("9 Nov 2025 reads as Miles's screenshot of the prototype", () => {
  const stop = dayOf("2025-11-09T00:00:00Z");
  const s = stateAt(model, stop);
  assert.equal(formatDate(dayStart(model, stop)), "9 Nov 2025");
  assert.equal(s.count, 25);
  assert.equal(formatFlowUsd(s.collateral.now), "$123k");
  assert.equal(formatFlowUsd(s.collateral.total), "$206k");
  assert.equal(formatFlowUsd(s.collateral.out), "$83k");
  assert.equal(formatFlowUsd(s.debt.now), "$48k");
  assert.equal(formatFlowUsd(s.debt.total), "$60k");
  assert.equal(formatFlowUsd(s.debt.out), "$12k");
});

test("solid plus hatched is the in figure, and the sources fill the bar, at every stop", () => {
  for (let stop = 0; stop <= model.liveStop; stop++) {
    const s = stateAt(model, stop);
    for (const side of [s.collateral, s.debt]) {
      const bar = side.bar.reduce((a, x) => a + x.width, 0);
      const src = side.sources.reduce((a, x) => a + x.width, 0);
      assert.ok(near(bar, side.total, 1e-6), `bar at ${stop}`);
      assert.ok(near(src, side.total, 1e-6), `sources at ${stop}`);
      assert.ok(near(side.now + side.out, side.total, 1e-6));
      assert.ok(side.sources.every((x) => x.width >= 0));
      assert.ok(side.total <= model.axis.max, `axis at ${stop}`);
    }
  }
});

test("previous and next visit every event day once, in order, and stop at the ends", () => {
  const seen: number[] = [];
  let stop = 0;
  if (model.eventDays[0] === 0) seen.push(0);
  for (;;) {
    const n = nextEventDay(model, stop);
    if (n === stop || n >= model.liveStop) break;
    seen.push(n);
    stop = n;
  }
  assert.deepEqual(seen, model.eventDays);
  assert.equal(nextEventDay(model, model.eventDays[model.eventDays.length - 1]), model.liveStop);
  const back: number[] = [];
  stop = model.liveStop;
  for (;;) {
    const p = prevEventDay(model, stop);
    back.push(p);
    if (p === 0) break;
    stop = p;
  }
  assert.deepEqual(back.reverse(), model.eventDays);
  assert.equal(prevEventDay(model, 0), 0);
});

test("the stale WBTC price is marked where it steps", () => {
  const oct7 = dayOf("2025-10-07T00:00:00Z");
  assert.ok(
    model.repricings.some((r) => r.day === oct7 && r.symbol === "WBTC" && formatDate(r.from) === "10 Aug 2023"),
  );
  // Before the step, the scrubber names the old price.
  const s = stateAt(model, oct7 - 1);
  assert.ok(s.stale.some((x) => x.symbol === "WBTC" && formatDate(x.pricedAt) === "10 Aug 2023"));
  assert.equal(stateAt(model, model.liveStop).stale.length, 0);
});

test("the axis rule", () => {
  assert.deepEqual(model.axis, { max: 320_000, ticks: [0, 100_000, 200_000, 300_000] });
  assert.deepEqual(axisFor(122_043), { max: 125_000, ticks: [0, 25_000, 50_000, 75_000, 100_000, 125_000] });
});

test("the number format", () => {
  assert.equal(formatFlowUsd(363.4), "$363");
  assert.equal(formatFlowUsd(5_473), "$5.5k");
  assert.equal(formatFlowUsd(123_024), "$123k");
  assert.equal(formatFlowUsd(-5_000), "−$5.0k");
  assert.equal(formatFlowUsd(1_234_567), "$1.2M");
  assert.equal(formatFlowUsd(9_999.7), "$10k");
});
