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
//
// A daily series continues on its stored oracle rounds where the chain serves
// them (`roundsOf`, `joinRounds`; rails-ops reference/asset-key-map.md,
// "Rounds and the daily join"): from the rounds' first day each day is their
// close, earlier days the store's, and the series keeps every round in
// `rounds` for a chart that draws them.

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
  /** The position's own rows priced on their days, each a mark on the line
   *  at the row's price (which may differ from the day's close). */
  events?: PriceEvent[];
  /** The position's liquidation level in `unit`, a second line on the same axis. */
  level?: PriceLevel;
  /** A day without a point is a gap, never the last point carried (a
   *  derived series such as the health factor, which has no figure on a day
   *  with no debt). */
  noCarry?: true;
  /** A derived series' receipt in its family's words (the health factor):
   *  at the live read, and at a point resting on a block ("{block}", "{day}"). */
  here?: { live: string; read: string };
  /** Days before this one are the rows alone and draw by the sparse rule:
   *  every segment dotted, the observations marked by `events`. */
  sparseBefore?: number;
  /** The stored rounds the series reads from `rounds.joinDay` on (`joinRounds`). */
  rounds?: PriceRounds;
}
/** A row's price on its day: [the row's day, price, block]; a redemption row
 *  adds the redemption price it was redeemed at. */
export interface PriceEvent {
  day: number;
  price: number;
  block: number | null;
  tone: "event" | "redemption" | "liquidation";
  redemptionPrice?: number;
}
/** A liquidation level per day ([day, level, block of the row it rests on,
 *  null for a live read]), the line ending where the position did. */
export interface PriceLevel {
  points: PricePoint[];
  /** The caption's formula in words. */
  formula: string;
  /** The level's receipt: what it is and how it moves. */
  summary: string;
  end: "liquidation" | "close" | "today";
  /** The receipt's second sentence where it is not a Trove's: at the live
   *  read, and at a point resting on a block ("{block}", "{day}"). */
  here?: { live: string; read: string };
}
/** What a family adds to an asset's series for the price view. */
export type PriceMarks = Pick<PriceSeries, "events" | "level" | "sparseBefore">;
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

/** A daily wire's observations for one asset (a panel's
 *  `FlowTimeline.dailyPrices` entry) as a daily series: the block from the
 *  third element or null, each price divided by 10^`scale` where the wire
 *  states it in grains of the unit. Null where no price is usable. */
export function dayObsPriceSeries(
  obs: readonly DayObs[],
  opts: { key: string; asset: PriceSeries["asset"]; unit: string; source: string; scale?: number },
): PriceSeries | null {
  const div = 10 ** (opts.scale ?? 0);
  const points = fromDayObs(div === 1 ? obs : obs.map(([d, p, b]) => [d, p / div, b] as DayObs));
  if (points.length === 0) return null;
  return { key: opts.key, asset: opts.asset, unit: opts.unit, grain: "daily", source: opts.source, points };
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

// ── Stored rounds, joined below by the daily stores ─────────────────────────
// (rails-ops reference/asset-key-map.md, "Rounds and the daily join")

/** A stored-rounds point: [unix seconds the value took force, price in the
 *  series' unit, block it took force at, the leg that moved it (an index into
 *  `PriceRounds.legs`), the leg row's block, its transaction, its proxy round
 *  id (null for a cap row)]. */
export type RoundPricePoint = [
  ts: number,
  price: number,
  block: number,
  leg: number,
  srcBlock: number,
  tx: string,
  round: string | null,
];
export interface PriceRounds {
  /** How the line is had from stored legs: a feed, or a composer over them. */
  kind: "feed" | "aave" | "compound" | "product";
  legs: { kind: "feed" | "cap"; name: string; address: string }[];
  /** Every change of the value in force, ascending (thinned where `thinned`). */
  points: RoundPricePoint[];
  /** The first point: the line reads rounds from here on. */
  from: { ts: number; block: number };
  /** Sieve's checkpoint the rounds run to. */
  asOf: { ts: number; block: number };
  /** The first UTC day whose point is the rounds' close; earlier days are the daily store's. */
  joinDay: number;
  /** Points in the stored span (before any thinning). */
  total: number;
  thinned: boolean;
}

/** An asset chart opens on its stored rounds (anatomy A3.3) once its main
 *  line's rounds span this many days (Miles, 26 Oct 2026); below it, on
 *  every day. */
export const ROUNDS_VIEW_MIN_DAYS = 30;

/** Whether a chart opens on its main line's rounds: they span
 *  ROUNDS_VIEW_MIN_DAYS or more, and the range drawn (unix seconds, the
 *  whole span where none is chosen) lies inside them. */
export function opensOnRounds(r: PriceRounds, range?: { from: number; to: number }): boolean {
  if ((r.asOf.ts - r.from.ts) / 86_400 < ROUNDS_VIEW_MIN_DAYS) return false;
  return range == null || (range.from >= r.from.ts && range.to <= r.asOf.ts);
}

/** The source the joined days name. */
export const ROUNDS_SOURCE = "rounds";

/** The wire's line as prices: its points and day closes, or null where the
 *  stored rows do not settle it or it states another unit than `unit` (a
 *  WETH Comet's ETH prices, which its daily series carries in USD). `asOf`
 *  is the answer's. */
export function roundsOf(
  wire: {
    kind: PriceRounds["kind"];
    unit?: string;
    scale: number;
    legs: PriceRounds["legs"];
    from: { block: number; ts: number } | null;
    total: number;
    points: [number, string, number, number, number, string, string | null][];
    days: [number, string, number, 0 | 1][];
    thinned?: true;
  },
  asOf: { block: number; ts: number | null } | undefined,
  unit = "usd",
): { rounds: PriceRounds; days: PricePoint[] } | null {
  if ((wire.unit ?? "usd") !== unit) return null;
  if (!wire.from || wire.points.length === 0 || wire.days.length === 0) return null;
  const div = 10 ** wire.scale;
  const points: RoundPricePoint[] = [];
  for (const [ts, raw, block, leg, src, tx, round] of wire.points) {
    const price = Number(raw) / div;
    if (goodPrice(price)) points.push([ts, price, block, leg, src, tx, round]);
  }
  const days: PricePoint[] = [];
  for (const [day, raw, block] of wire.days) {
    const price = Number(raw) / div;
    if (goodPrice(price)) days.push([day, price, block]);
  }
  if (!points.length || !days.length) return null;
  const last = points[points.length - 1];
  return {
    rounds: {
      kind: wire.kind,
      legs: wire.legs,
      points,
      from: wire.from,
      asOf: { block: asOf?.block ?? last[2], ts: asOf?.ts ?? last[0] },
      joinDay: days[0][0],
      total: wire.total,
      thinned: wire.thinned === true,
    },
    days,
  };
}

/** A daily series continued by its stored rounds: the store's days before
 *  the rounds' first day, the rounds' day closes from it on (today's, the
 *  value in force at the checkpoint), each joined day naming ROUNDS_SOURCE. */
export function joinRounds(series: PriceSeries, r: { rounds: PriceRounds; days: PricePoint[] }): PriceSeries {
  const sources = [...(series.sources ?? [])];
  let src = sources.indexOf(ROUNDS_SOURCE);
  if (src < 0) src = sources.push(ROUNDS_SOURCE) - 1;
  const before = series.points.filter((p) => p[0] < r.rounds.joinDay);
  const after = r.days.map((p): PricePoint => [p[0], p[1], p[2], src]);
  return { ...series, sources, points: [...before, ...after], rounds: r.rounds };
}

/** The rounds point in force at `ts`, or null before the first. */
export function roundAt(rounds: PriceRounds, ts: number): RoundPricePoint | null {
  const pts = rounds.points;
  let lo = 0;
  let hi = pts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pts[mid][0] <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo ? pts[lo - 1] : null;
}
