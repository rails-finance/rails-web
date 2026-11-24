// The asset page's price chart and the words around it (ui-jobs 818, 819):
// lib/shared/asset-spread.ts (a daily read against a rounds close, for the
// Prices list's flags), lib/shared/asset-chart-grid.ts (`legendMoment`) and
// lib/shared/asset-captions.ts (the join). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// The modules import their siblings by extensionless specifier, as the app does.
const hooks = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if (specifier.startsWith(".") && !/\\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const url = new URL(specifier + ".ts", context.parentURL).href;
    if (existsSync(fileURLToPath(url))) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { lineSpreads } = await import("../../lib/shared/asset-spread.ts");
const { DAY_S, cellAt, cellOf, gridFor, legendMoment, tickShown } = await import(
  "../../lib/shared/asset-chart-grid.ts"
);
const { joinText } = await import("../../lib/shared/asset-captions.ts");

// WETH on Ethereum, 26–30 May 2025 (days 20234–20238), as the stores hold it:
// the main line's stored rounds (Chainlink ETH / USD), each day's close at the
// block its last round took force, and Maker's OSM read by the daily store.
const CLOSES = [
  [20234, 2556.43, 22570119],
  [20235, 2655.04, 22577391],
  [20236, 2678.33, 22584483],
  [20237, 2622.74, 22591777],
  [20238, 2524.59, 22598872],
];
const MAKER = [
  [20234, 2562.43, 22570404],
  [20235, 2672.16, 22577557],
  [20236, 2631.81, 22584692],
  [20237, 2652.11, 22591830],
  [20238, 2586.43, 22598987],
];
// Read 52 blocks (over ten minutes) before the close: the main line may have moved since.
const AAVE_EARLY = [[20238, 2530.0, 22598820]];
// Each close's round, at 20:00 UTC of its day, and a round at 08:00 before it.
const ROUNDS = CLOSES.flatMap(([day, close, block]) => [
  [day * DAY_S + 8 * 3600, close * 0.99, block - 3600],
  [day * DAY_S + 20 * 3600, close, block],
]);
const main = { key: "main", points: CLOSES, rounds: { points: ROUNDS, joinDay: 19250 } };

test("a daily read at or after the main line's rounds close compares with that close (819b)", () => {
  const [maker, aave] = lineSpreads(
    main,
    [
      { key: "maker", points: MAKER },
      { key: "aave", points: AAVE_EARLY },
    ],
    1,
  );
  assert.deepEqual([...maker.byDay.keys()], [20234, 20235, 20236, 20237, 20238], "every day compares");
  assert.ok(Math.abs(maker.byDay.get(20238) - (2586.43 / 2524.59 - 1)) < 1e-12, "30 May: Maker 2.45 % above");
  assert.equal(maker.passes, true);
  assert.equal(maker.largest.day, 20238);
  assert.ok(!aave.byDay.has(20238), "a read 52 blocks before the close keeps the ten-minute window");
  // Two daily stores keep the window both ways: 115 blocks apart is 23 minutes.
  const [daily] = lineSpreads({ key: "m", points: CLOSES }, [{ key: "maker", points: MAKER }], 1);
  assert.ok(!daily.byDay.has(20238), "without rounds the reads are 23 minutes apart");
  // The other way round: the other line's day is its close, the main line a daily read after it.
  const [flip] = lineSpreads(
    { key: "maker", points: MAKER },
    [{ key: "cl", points: CLOSES, rounds: { points: ROUNDS, joinDay: 19250 } }],
    1,
  );
  assert.ok(flip.byDay.has(20238));
});

test("the readout reads the cursor in the window, else the window's last moment (819a)", () => {
  const bounds = { t0: 19000 * DAY_S, t1: 20780 * DAY_S + 3600 };
  const shown = { from: 20234 * DAY_S, to: 20239 * DAY_S };
  const g = gridFor(shown, bounds, 600);
  const sept = 20355 * DAY_S + DAY_S - 60; // 24 Sep 2025, 23:59 UTC
  const out = legendMoment(sept, shown, bounds.t1, g);
  assert.equal(out.cursor, false, "a cursor left on 24 Sep 2025 is outside 26–30 May");
  assert.ok(out.ts >= shown.from && out.ts <= shown.to, "the stamp lies inside the window");
  assert.equal(out.ts, cellAt(g, cellOf(g, shown.to - 1)), "the window's last cell");
  const inside = 20236 * DAY_S + 3600;
  assert.deepEqual(legendMoment(inside, shown, bounds.t1, g), { ts: inside, cursor: true });
  assert.equal(legendMoment(null, shown, bounds.t1, g).cursor, false);
  // A window reaching the checkpoint reads the checkpoint.
  const tail = { from: bounds.t1 - 7 * DAY_S, to: bounds.t1 + 600 };
  const g2 = gridFor(tail, bounds, 600);
  assert.equal(legendMoment(null, tail, bounds.t1, g2).ts, bounds.t1);
  assert.equal(legendMoment(null, shown, bounds.t1, null).ts, shown.to - 1);
});

test("a wide window's axis names months and years, no day (818)", () => {
  const all = 1500 * DAY_S;
  assert.equal(tickShown(0, all), true, "a year");
  assert.equal(tickShown(1, all), true, "a month");
  assert.equal(tickShown(2, all), false, "no '8 Sep' among the months");
  assert.equal(tickShown(2, 30 * DAY_S), true, "30D names days");
  assert.equal(tickShown(3, DAY_S), true, "1D names times");
});

test("the join names the day the line becomes its stored rounds", () => {
  assert.equal(
    joinText(19250),
    "From 15 Sep 2022 the line is its stored oracle rounds, each day at its close; before it, the daily store.",
  );
});
