// One price series shape for every family's chart, sparkline and asset page,
// and the adapters from the three price wires and from a family's rows
// (rails-ops reference/lifetime-flows-scrubber.md; ui-jobs 328, step 1).
//
// A point is [UTC day, price in the series' unit, block the price was read
// at, index into `sources`]. The block is null where the wire carried none.
// A price that is not finite or not positive is dropped, and so is a store
// row whose unit the caller does not accept. Points ascend by day; a daily
// series keeps the last point of each day, an event series one per block.
// Nothing is interpolated: a day without a point reads the last one before
// it, marked carried, with its age.

import type { DailyAnswer } from "@/lib/api/fetch-daily-prices";
import type { FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";

export type PriceGrain = "daily" | "event";
/** [UTC day, price in `unit`, block the price was read at (null where the wire had none), index into `sources`?] */
export type PricePoint = [day: number, price: number, block: number | null, src?: number];
export interface PriceSeries {
  /** "<family>:<asset address>" for a flows route, "liquity-v2:<branch>", the store's key, or a family's own key for rows. */
  key: string;
  asset: { symbol: string; address?: string; chain: number };
  /** "usd", "eth", "token:0x…" or a family's own word ("bold", "fxusd"): the unit the liquidation level is written in. */
  unit: string;
  grain: PriceGrain;
  /** The caption's source in words: "AaveOracle", "branch PriceFeed, Trove operations", "daily store". */
  source: string;
  /** The store's per-point sources (`seed:<table>`, `read:<family>`). */
  sources?: string[];
  points: PricePoint[];
}
/** A daily wire's observation: [day, price, block], the block absent on an older server. */
export type DayObs = [number, number, (number | null)?];

const DAY_S = 86_400;

const goodPrice = (p: number) => Number.isFinite(p) && p > 0;

function toBlock(b: unknown): number | null {
  if (b == null || b === "") return null;
  const n = typeof b === "number" ? b : Number(b);
  return Number.isFinite(n) ? n : null;
}

/** Ascending by day, the last point of each day kept. */
function dailyPoints(points: PricePoint[]): PricePoint[] {
  const byDay = new Map<number, PricePoint>();
  for (const p of points) byDay.set(p[0], p);
  return [...byDay.values()].sort((a, b) => a[0] - b[0]);
}

/** The shared store's answer as one series per key, in the unit of the
 *  latest row `accept` takes (USD by default); rows in another unit are
 *  dropped. `asset` names each key's asset; a key it returns null for is
 *  left out. */
export function dailyStorePriceSeries(
  body: DailyAnswer,
  asset: (key: string) => PriceSeries["asset"] | null,
  accept: (unit: string) => boolean = (u) => u === "usd",
): Record<string, PriceSeries> {
  const out: Record<string, PriceSeries> = {};
  for (const [key, s] of Object.entries(body.series ?? {})) {
    const a = asset(key);
    if (!a) continue;
    const obs = s.obs ?? [];
    let unit: string | null = null;
    for (const o of obs) {
      const u = o[3] ?? s.unit;
      if (u != null && accept(u)) unit = u;
    }
    if (unit == null) continue;
    const sources = Array.isArray(s.sources) ? s.sources : undefined;
    const points: PricePoint[] = [];
    obs.forEach(([day, raw, block, rowUnit, rowScale], i) => {
      if ((rowUnit ?? s.unit) !== unit) return;
      const sc = rowScale ?? s.scale;
      const price = sc != null ? Number(raw) / 10 ** sc : NaN;
      if (!goodPrice(price)) return;
      const src = sources ? s.src?.[i] : undefined;
      points.push(src != null ? [day, price, toBlock(block), src] : [day, price, toBlock(block)]);
    });
    if (points.length === 0) continue;
    out[key] = {
      key,
      asset: a,
      unit,
      grain: "daily",
      source: "daily store",
      ...(sources ? { sources } : {}),
      points: dailyPoints(points),
    };
  }
  return out;
}

function fromDayObs(obs: readonly DayObs[]): PricePoint[] {
  const points: PricePoint[] = [];
  for (const [day, price, block] of obs) if (goodPrice(price)) points.push([day, price, toBlock(block)]);
  return dailyPoints(points);
}

/** An Aave-family flows answer as one USD series per held asset, keyed
 *  "<family>:<asset address>". `source` names the oracle ("AaveOracle"). */
export function flowsPriceSeries(
  series: Pick<FlowSeries, "prices" | "assets">,
  opts: { family: string; chain: number; source: string },
): PriceSeries[] {
  const out: PriceSeries[] = [];
  for (const [address, p] of Object.entries(series.prices)) {
    const points = fromDayObs(p.obs);
    if (points.length === 0) continue;
    out.push({
      key: `${opts.family}:${address}`,
      asset: { symbol: series.assets[address]?.symbol ?? address, address, chain: opts.chain },
      unit: "usd",
      grain: "daily",
      source: opts.source,
      points,
    });
  }
  return out;
}

const isDayObs = (o: unknown): o is DayObs =>
  Array.isArray(o) &&
  (o.length === 2 || o.length === 3) &&
  typeof o[0] === "number" &&
  typeof o[1] === "number" &&
  (o.length === 2 || o[2] === null || typeof o[2] === "number");

/** A Liquity V2 branch answer's `obs` where every row is `[day, usd]` or
 *  `[day, usd, block]`, else null (none, a failed read, a shape it does not know). */
export function liquityBranchObs(answer: unknown): DayObs[] | null {
  const obs = answer != null && typeof answer === "object" ? (answer as { obs?: unknown }).obs : null;
  return Array.isArray(obs) && obs.length > 0 && obs.every(isDayObs) ? obs : null;
}

/** A Liquity V2 branch answer as its collateral's USD series, keyed
 *  "liquity-v2:<branch>"; null where the answer has no rows. */
export function liquityBranchPriceSeries(answer: unknown, branch: string): PriceSeries | null {
  const obs = liquityBranchObs(answer);
  const points = obs ? fromDayObs(obs) : [];
  if (points.length === 0) return null;
  return {
    key: `liquity-v2:${branch}`,
    asset: { symbol: branch, chain: 1 },
    unit: "usd",
    grain: "daily",
    source: "branch PriceFeed, Trove operations",
    points,
  };
}

/** A family's row prices as an event series: one point per block (the
 *  first row's price where two rows share a block), ascending. */
export function eventPriceSeries(input: {
  key: string;
  asset: PriceSeries["asset"];
  unit: string;
  source: string;
  obs: readonly { block: number; ts: number; price: number }[];
}): PriceSeries {
  const byBlock = new Map<number, PricePoint>();
  for (const o of input.obs)
    if (goodPrice(o.price) && Number.isFinite(o.block) && !byBlock.has(o.block))
      byBlock.set(o.block, [Math.floor(o.ts / DAY_S), o.price, o.block]);
  return {
    key: input.key,
    asset: input.asset,
    unit: input.unit,
    grain: "event",
    source: input.source,
    points: [...byBlock.values()].sort((a, b) => a[2]! - b[2]!),
  };
}

export interface PriceAt {
  point: PricePoint;
  /** The point is from a day before the one asked. */
  carried: boolean;
  /** Days from the point's day to the one asked. */
  ageDays: number;
}

/** The series' price on `day`: the day's last point, else the last point
 *  before it, carried; null before the first point. */
export function priceAt(series: PriceSeries, day: number): PriceAt | null {
  const pts = series.points;
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= day) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return null;
  const point = pts[lo - 1];
  return { point, carried: point[0] < day, ageDays: day - point[0] };
}

/** The points of the `n` days ending on `today` (default the series' last
 *  day). */
export function lastDays(series: PriceSeries, n: number, today?: number): PricePoint[] {
  const pts = series.points;
  if (pts.length === 0) return [];
  const end = today ?? pts[pts.length - 1][0];
  return pts.filter((p) => p[0] > end - n && p[0] <= end);
}
