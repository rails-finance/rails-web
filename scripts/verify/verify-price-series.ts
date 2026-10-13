// verify-price-series — the shared price series reader (lib/shared/price-series.ts;
// rails-ops reference/lifetime-flows-scrubber.md, ui-jobs 328 step 1): each
// adapter keeps the block where the wire carries one and null where it does
// not, ascends by day, keeps one point per day (daily) or per block (event),
// drops a price that is not finite or not positive and a store row in a unit
// the caller does not accept; `priceAt` carries the last point with its age.
// ----------------------------------------------------------------------------
// OFFLINE. The Aave V3 flows answer is lifetime-flows-series-fb93.json (the
// route's answer without a block, read on victoria 2026-09-29) and a small
// inline answer with one. The store and Liquity V2 branch answers are inline,
// in both forms.
//
//   npx tsx --test scripts/verify/verify-price-series.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyPricesFromAnswer } from "@/lib/api/fetch-daily-prices";
import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import {
  dailyStorePriceSeries,
  eventPriceSeries,
  flowsPriceSeries,
  lastDays,
  liquityBranchObs,
  liquityBranchPriceSeries,
  priceAt,
  type DayObs,
  type PriceAt,
  type PriceGrain,
  type PricePoint,
  type PriceSeries,
} from "@/lib/shared/price-series";

const FIX = join(__dirname, "fixtures");
const ascending = (pts: PricePoint[]) => pts.every((p, i) => i === 0 || pts[i - 1][0] < p[0]);
const grainOf = (s: PriceSeries): PriceGrain => s.grain;

const CV2_CETH = "cv2:0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";
const CV3_WETH = "cv3:0xc3d688b66703497daa19211eedff47f25384cdc3:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// The store's answer as an older server sends it: no sources. Compound V2's
// cETH turns from ETH to USD inside the series (per-row unit and scale);
// a duplicate day, an out-of-order row, a zero and a garbage price.
const STORE_OLD: DailyAnswer = {
  series: {
    [CV2_CETH]: {
      unit: "usd",
      scale: 18,
      obs: [
        [18490, "1000000000000000000", "10678000", "eth", 18],
        [18491, "1000000000000000000", "10678700", "eth", 18],
        [18493, "390000000000000000000", "10685000"],
        [18492, "385000000000000000000", "10679000"],
        [18493, "391000000000000000000", "10685100"],
        [18494, "0", "10692000"],
        [18495, "nope", "10698000"],
      ],
    },
  },
};
// The same store with the new fields: `sources` and per-row `src`.
const STORE_NEW: DailyAnswer = {
  series: {
    [CV3_WETH]: {
      unit: "usd",
      scale: 8,
      obs: [
        [20000, "250000000000", "20100000"],
        [20001, "251000000000", "20107000"],
        [20003, "249000000000", "20121000"],
      ],
      sources: ["seed:compound_v3_prices_at_block", "read:compound-v3"],
      src: [0, 1, 0],
    },
  },
};
const ASSET = (key: string) => ({ symbol: key.startsWith("cv2:") ? "ETH" : "WETH", chain: 1 });

test("store, older server: the block kept, ascending, one per day, the ETH rows left out", () => {
  const out = dailyStorePriceSeries(STORE_OLD, ASSET);
  const s = out[CV2_CETH];
  assert.ok(s, "the series is there");
  assert.equal(s.unit, "usd");
  assert.equal(grainOf(s), "daily");
  assert.equal(s.source, "daily store");
  assert.equal(s.sources, undefined);
  assert.deepEqual(s.points, [
    [18492, 385, 10679000],
    [18493, 391, 10685100],
  ]);
  assert.ok(ascending(s.points));
  // The pages' pair reader is unchanged by the block and the unit filter.
  assert.deepEqual(
    dailyPricesFromAnswer(STORE_OLD)[CV2_CETH].map(([d]) => d),
    [18492, 18493, 18493],
  );
});

test("store, ETH accepted: the series reads in ETH and the USD rows drop", () => {
  const s = dailyStorePriceSeries(STORE_OLD, ASSET, (u) => u === "eth")[CV2_CETH];
  assert.equal(s.unit, "eth");
  assert.deepEqual(s.points, [
    [18490, 1, 10678000],
    [18491, 1, 10678700],
  ]);
});

test("store, new server: per-point source index and the sources list", () => {
  const s = dailyStorePriceSeries(STORE_NEW, ASSET)[CV3_WETH];
  assert.deepEqual(s.sources, ["seed:compound_v3_prices_at_block", "read:compound-v3"]);
  assert.deepEqual(s.points, [
    [20000, 2500, 20100000, 0],
    [20001, 2510, 20107000, 1],
    [20003, 2490, 20121000, 0],
  ]);
  assert.equal(Object.keys(dailyStorePriceSeries(STORE_NEW, () => null)).length, 0, "an unnamed key is left out");
});

test("priceAt: the day's point, a carried read with its age, null before the first", () => {
  const s = dailyStorePriceSeries(STORE_NEW, ASSET)[CV3_WETH];
  const on: PriceAt | null = priceAt(s, 20001);
  assert.deepEqual(on, { point: [20001, 2510, 20107000, 1], carried: false, ageDays: 0 });
  assert.deepEqual(priceAt(s, 20002), { point: [20001, 2510, 20107000, 1], carried: true, ageDays: 1 });
  assert.deepEqual(priceAt(s, 20040)?.ageDays, 37);
  assert.equal(priceAt(s, 19999), null);
});

test("lastDays: the n days ending on today, or on the last point", () => {
  const s = dailyStorePriceSeries(STORE_NEW, ASSET)[CV3_WETH];
  assert.deepEqual(
    lastDays(s, 3).map((p) => p[0]),
    [20001, 20003],
  );
  assert.deepEqual(
    lastDays(s, 2, 20001).map((p) => p[0]),
    [20000, 20001],
  );
  assert.deepEqual(lastDays(s, 30, 20100), []);
});

test("Aave V3 flows, the route without a block: one series per held asset, block null", () => {
  const fb93 = JSON.parse(readFileSync(join(FIX, "lifetime-flows-series-fb93.json"), "utf8")) as FlowSeries;
  const list = flowsPriceSeries(fb93, { family: "aave-v3", chain: 1, source: "AaveOracle" });
  assert.equal(list.length, Object.keys(fb93.prices).length);
  const wbtc = list.find((s) => s.asset.symbol === "WBTC")!;
  assert.equal(wbtc.key, "aave-v3:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599");
  assert.equal(wbtc.asset.address, "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599");
  assert.equal(wbtc.unit, "usd");
  assert.equal(wbtc.source, "AaveOracle");
  assert.deepEqual(wbtc.points[0], [19579, 29459.67, null]);
  for (const s of list) {
    assert.ok(ascending(s.points), `${s.asset.symbol} ascends one point per day`);
    assert.ok(
      s.points.every((p) => p[2] === null && p[1] > 0),
      `${s.asset.symbol} has no block`,
    );
  }
});

test("Aave V3 flows, the route with a block: kept, null where the route had none", () => {
  const answer = {
    assets: { "0xaa": { symbol: "WETH", decimals: 18 }, "0xbb": { symbol: "USDC", decimals: 6 } },
    prices: {
      "0xaa": {
        obs: [
          [20002, 2600, 21000300],
          [20001, 2550, 21000100],
          [20003, -1, 21000500],
        ] as DayObs[],
        maxGapDays: 0,
      },
      "0xbb": { obs: [[20001, 1, null]] as DayObs[], maxGapDays: 0 },
    },
  };
  const [weth, usdc] = flowsPriceSeries(answer, { family: "spark", chain: 1, source: "AaveOracle" });
  assert.deepEqual(weth.points, [
    [20001, 2550, 21000100],
    [20002, 2600, 21000300],
  ]);
  assert.deepEqual(usdc.points, [[20001, 1, null]]);
  assert.equal(usdc.key, "spark:0xbb");
});

test("Liquity V2 branch: both forms, and a shape it does not know reads as none", () => {
  const old = {
    collateralType: "WETH",
    obs: [
      [20226, 3100.5],
      [20227, 3050],
    ],
    today: 20300,
  };
  const now = {
    collateralType: "WETH",
    obs: [
      [20227, 3050, 22500100],
      [20226, 3100.5, 22493000],
    ],
    today: 20300,
  };
  const a = liquityBranchPriceSeries(old, "WETH")!;
  const b = liquityBranchPriceSeries(now, "WETH")!;
  assert.equal(a.key, "liquity-v2:WETH");
  assert.equal(a.source, "branch PriceFeed, Trove operations");
  assert.deepEqual(a.points, [
    [20226, 3100.5, null],
    [20227, 3050, null],
  ]);
  assert.deepEqual(b.points, [
    [20226, 3100.5, 22493000],
    [20227, 3050, 22500100],
  ]);
  assert.equal(liquityBranchObs(now)?.length, 2, "the hook takes the new form");
  assert.equal(liquityBranchObs({ obs: [[20226, "3100"]] }), null);
  assert.equal(liquityBranchObs({ obs: [] }), null);
  assert.equal(liquityBranchObs(null), null);
  assert.equal(liquityBranchPriceSeries({ error: "x" }, "WETH"), null);
});

test("event grain: one point per block, ascending, bad prices dropped", () => {
  const s = eventPriceSeries({
    key: "ebisu:weeth",
    asset: { symbol: "weETH", chain: 1 },
    unit: "usd",
    source: "branch PriceFeed",
    obs: [
      { block: 300, ts: 2 * 86_400 + 10, price: 2700 },
      { block: 100, ts: 86_400 + 5, price: 2600 },
      { block: 300, ts: 2 * 86_400 + 10, price: 2701 },
      { block: 200, ts: 86_400 + 900, price: 2650 },
      { block: 250, ts: 86_400 + 950, price: Number.NaN },
    ],
  });
  assert.equal(grainOf(s), "event");
  assert.deepEqual(s.points, [
    [1, 2600, 100],
    [1, 2650, 200],
    [2, 2700, 300],
  ]);
  assert.deepEqual(priceAt(s, 1)?.point, [1, 2650, 200], "a day with two events reads its last");
  assert.equal(priceAt(s, 3)?.carried, true);
});
