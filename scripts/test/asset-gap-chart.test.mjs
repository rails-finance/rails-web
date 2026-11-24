// The asset page's gap chart and the words around its two charts (ui-jobs 818,
// 819): lib/shared/asset-spread.ts (a daily read against a rounds close),
// lib/shared/asset-chart-grid.ts (`gapSeries`, `legendMoment`) and
// lib/shared/asset-captions.ts. Run: npm test
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

const { lineSpreads, dashReason } = await import("../../lib/shared/asset-spread.ts");
const { DAY_S, cellAt, cellOf, gapSeries, gridFor, legendMoment, lineTrack } = await import(
  "../../lib/shared/asset-chart-grid.ts"
);
const { chartCaptions, joinText, sourceName } = await import("../../lib/shared/asset-captions.ts");

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
const T1 = 20239 * DAY_S - 1;
const mainRounds = {
  points: ROUNDS,
  joinDay: 19250,
  from: { ts: ROUNDS[0][0] },
  asOf: { ts: T1 },
};
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
  assert.equal(dashReason(aave, 20238, false), "window");
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

test("the gap chart draws each daily line's gap in a window shorter than a week (819b)", () => {
  const bounds = { t0: 20234 * DAY_S, t1: T1 };
  const g = gridFor({ from: 20234 * DAY_S, to: 20239 * DAY_S }, bounds, 600);
  assert.ok(g.step < DAY_S, `an intraday grid (${g.step} s a cell)`);
  const mainTrack = lineTrack(CLOSES, mainRounds, g.step, T1);
  const makerTrack = lineTrack(MAKER, null, g.step, T1);
  const [spread] = lineSpreads(main, [{ key: "maker", points: MAKER }], 1);
  const [gaps] = gapSeries(g, mainTrack, [{ track: makerTrack, byDay: spread.byDay }]);
  assert.equal(gaps.length, g.count);
  const noon30 = cellOf(g, 20238 * DAY_S + 12 * 3600);
  assert.ok(Math.abs(gaps[noon30] - (2586.43 / 2524.59 - 1) * 100) < 1e-9, "30 May reads +2.45 % all day");
  const drawn = gaps.filter((v) => v != null).length;
  assert.ok(drawn >= g.count * 0.9, `${drawn} of ${g.count} cells drawn`);
  // A line with no comparable day draws nothing.
  const [none] = gapSeries(g, mainTrack, [{ track: makerTrack, byDay: new Map() }]);
  assert.ok(none.every((v) => v == null));
});

test("the legends read the cursor in the window, else the window's last moment (819a)", () => {
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

const tok = { chain: 1, token: "0xc02a", symbol: "WETH" };
const cl = {
  id: "0x5f4e",
  oracle: { address: "0x5f4e", name: "Chainlink ETH / USD", kind: "chainlink" },
  series: [
    {
      key: "liquity-v2:WETH",
      protocol: "Liquity V2",
      token: tok,
      via: { address: "0xcc5f", name: "Liquity V2 WETH PriceFeed", kind: "pass" },
    },
    {
      key: "moonwell:0xb85c",
      protocol: "Moonwell",
      token: tok,
      via: { address: "0xa0f8", name: "Moonwell's OEV wrapper", kind: "pass" },
    },
  ],
};
const view = (over = {}) => ({
  explorer: { id: "liquity", label: "Liquity V2", chain: 1 },
  name: "Liquity V2",
  lineId: "0x5f4e",
  usualId: "0x5424",
  ...over,
});

test("the captions name the price each chart draws (818)", () => {
  assert.deepEqual(chartCaptions(view(), cl, "WETH", 5), {
    price: "The price Liquity V2 uses: Chainlink ETH / USD through Liquity V2 WETH PriceFeed",
    gap: "Other protocols' prices for WETH, against Liquity V2's",
  });
  assert.equal(chartCaptions(view(), cl, "WETH", 0).gap, null, "no other line, no gap chart");
  const aave = view({ explorer: { id: "aave-v3", label: "Aave V3", chain: 1 }, name: "Aave V3 Core" });
  const direct = { ...cl, series: [{ key: "aave-v3:core:0xc02a", protocol: "Aave V3 Core", token: tok }] };
  assert.equal(chartCaptions(aave, direct, "WETH", 3).price, "The price Aave V3 Core uses: Chainlink ETH / USD");
  assert.deepEqual(chartCaptions(null, cl, "WETH", 5), {
    price: "The price most protocols read: Chainlink ETH / USD",
    gap: "Other protocols' prices for WETH, against the most-read price",
  });
  const morpho = view({
    explorer: { id: "morpho", label: "Morpho Blue", chain: 1 },
    name: "Morpho Blue",
    lineId: null,
  });
  assert.equal(
    chartCaptions(morpho, cl, "USDC", 2).price,
    "Morpho Blue has no stored price for USDC here. The price most protocols read: Chainlink ETH / USD",
  );
  assert.equal(sourceName(cl, "moonwell"), "Chainlink ETH / USD through Moonwell's OEV wrapper");
  assert.equal(sourceName(cl, null), "Chainlink ETH / USD");
});

test("the join names one line in the singular (818)", () => {
  const r = (joinDay) => ({ rounds: { joinDay } });
  assert.equal(
    joinText([r(19250)], 6, 19250),
    "From 15 Sep 2022 1 of the 6 lines is its stored oracle rounds, each day at its close; before it, the daily store.",
  );
  assert.equal(
    joinText([r(19250), r(19250)], 6, 19250),
    "From 15 Sep 2022 2 of the 6 lines are their stored oracle rounds, each day at its close; before it, the daily store.",
  );
  assert.equal(
    joinText([r(19250)], 1, 19250),
    "From 15 Sep 2022 the line is its stored oracle rounds, each day at its close; before it, the daily store.",
  );
  assert.equal(
    joinText([r(19250), r(19300)], 2, 19250),
    "The lines are their stored oracle rounds from the time each line's stamp names, each day at its close; before it, the daily store.",
  );
});
