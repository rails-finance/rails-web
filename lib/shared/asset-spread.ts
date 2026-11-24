// The spread between an asset page's lines (rails-ops reference/asset-key-map.md,
// "The spread"): each line's deviation from the chart's main line, in
// percent, and where it passes SPREAD_LIMIT, its largest gap.
//
// Where both lines read stored rounds, they are compared at the same instant:
// at each day's close, and at every moment either value changes (the largest
// gap is the largest of those). Before that, on the daily stores, a day
// compares two lines only where both were read within READ_WINDOW_S of each
// other (from the blocks the store names), or where either is a constant:
// two reads hours apart measure the market moving between them, the blocks'
// span timed at the chain's rate in each era (./block-rate.ts; Base's Denim,
// ui-jobs 615). Where one line's day is its stored rounds' close, that close
// is in force from its round's block to the day's end, so the other line's
// read compares when it falls at or after that block, or within ten minutes
// before it (ui-jobs 819). Pure; the asset chart and the Prices list's flags
// read it.

import { blockSpanSeconds } from "./block-rate";

/** Lines further apart than this are named (1 %): two feeds that each update
 *  on a 0.5 % move can stand up to 1 % apart with neither wrong, and the
 *  majors' Chainlink lines read within ten minutes stay inside it. */
export const SPREAD_LIMIT = 0.01;
/** Two reads within ten minutes are one moment. */
export const READ_WINDOW_S = 600;

/** `[day, price, block]`, ascending by day. */
export type SpreadPoint = readonly [number, number, number | null, ...unknown[]];
/** `[unix seconds the value took force, price]`, ascending. */
export type SpreadRound = readonly [number, number, ...unknown[]];

export interface SpreadLine {
  key: string;
  points: readonly SpreadPoint[];
  /** A constant: compared whatever block it was read at. */
  fixed?: boolean;
  /** The line's stored rounds, and the first day whose point is their close. */
  rounds?: { points: readonly SpreadRound[]; joinDay: number };
}

export interface LineSpread {
  key: string;
  /** Day → the line's price over the main line's, less one. */
  byDay: Map<number, number>;
  /** Days both lines have a price but the reads fell outside READ_WINDOW_S. */
  apart: Set<number>;
  /** The largest gap, by size, with its moment where it is the rounds'.
   *  Null where no day compares. */
  largest: { day: number; dev: number; ts?: number } | null;
  /** Whether any day passes SPREAD_LIMIT. */
  passes: boolean;
  /** From this day both lines are compared on their rounds (no read window). */
  roundsFrom: number | null;
}

/** The value in force at `ts` in ascending rounds, or null before the first. */
export function inForce(points: readonly SpreadRound[], ts: number): number | null {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] <= ts) lo = mid + 1;
    else hi = mid;
  }
  return lo ? points[lo - 1][1] : null;
}

/** Each moment either line's rounds change, from when both stand, with the
 *  other's deviation from the main one then, and how long it held. */
export function roundDeviations(
  main: readonly SpreadRound[],
  other: readonly SpreadRound[],
  until?: number,
): { ts: number; dev: number; held: number }[] {
  if (!main.length || !other.length) return [];
  const start = Math.max(main[0][0], other[0][0]);
  const times = [...new Set([...main, ...other].map((p) => p[0]).filter((t) => t >= start))].sort((a, b) => a - b);
  if (times[0] !== start) times.unshift(start);
  const end = until ?? Math.max(main[main.length - 1][0], other[other.length - 1][0]);
  const out: { ts: number; dev: number; held: number }[] = [];
  times.forEach((t, i) => {
    const m = inForce(main, t);
    const o = inForce(other, t);
    if (m == null || o == null || !(m > 0) || !(o > 0)) return;
    out.push({ ts: t, dev: o / m - 1, held: Math.max(0, (times[i + 1] ?? end) - t) });
  });
  return out;
}

/** Each other line's deviation from `main`, day by day. */
export function lineSpreads(main: SpreadLine, others: readonly SpreadLine[], chain: number): LineSpread[] {
  // A chain with no rate here counts Ethereum's twelve seconds.
  const apart = (a: number, b: number) => blockSpanSeconds(chain, a, b) ?? Math.abs(a - b) * 12;
  const at = new Map(main.points.map((p) => [p[0], p]));
  return others.map((o) => {
    const byDay = new Map<number, number>();
    const apartDays = new Set<number>();
    let largest: LineSpread["largest"] = null;
    // A line given its rounds' day closes alone (the Prices list's flags) has
    // no points: its days compare at the same moment, with no moments between.
    const roundsFrom = main.rounds && o.rounds ? Math.max(main.rounds.joinDay, o.rounds.joinDay) : null;
    // A day's two reads, the main line's at block `a` and the other's at `b`:
    // a rounds close holds from its block on, so a read after it is the same moment.
    const closes = (l: SpreadLine, day: number) => l.rounds != null && day >= l.rounds.joinDay;
    const readTogether = (day: number, a: number, b: number) => {
      const near = apart(a, b) <= READ_WINDOW_S;
      const m = closes(main, day);
      const c = closes(o, day);
      if (m && !c) return b >= a || near;
      if (c && !m) return a >= b || near;
      return near;
    };
    const note = (day: number, dev: number, ts?: number) => {
      if (!largest || Math.abs(dev) > Math.abs(largest.dev)) largest = ts == null ? { day, dev } : { day, dev, ts };
    };
    // The rounds' moments first: a day's close that equals one names the moment.
    if (roundsFrom != null)
      for (const d of roundDeviations(main.rounds!.points, o.rounds!.points))
        note(Math.floor(d.ts / 86_400), d.dev, d.ts);
    for (const p of o.points) {
      const q = at.get(p[0]);
      if (!q || !(q[1] > 0) || !(p[1] > 0)) continue;
      // On the rounds both points are the day's close: one moment.
      const sameMoment = roundsFrom != null && p[0] >= roundsFrom;
      const timed = !sameMoment && !main.fixed && !o.fixed;
      if (timed && (p[2] == null || q[2] == null)) continue;
      if (timed && !readTogether(p[0], q[2]!, p[2]!)) {
        apartDays.add(p[0]);
        continue;
      }
      const dev = p[1] / q[1] - 1;
      byDay.set(p[0], dev);
      note(p[0], dev);
    }
    const big = largest as LineSpread["largest"];
    return {
      key: o.key,
      byDay,
      apart: apartDays,
      largest: big,
      passes: big != null && Math.abs(big.dev) > SPREAD_LIMIT,
      roundsFrom,
    };
  });
}

/** Why a line has no deviation at a cell: its read fell outside READ_WINDOW_S of
 *  the main line's that day (`window`), the rounds chart holds no stored round
 *  for it then (`rounds`), or no day compares (`none`, as before a line began). */
export type DashReason = "window" | "rounds" | "none";

/** The reason for a dash at `day` (UTC day number); `onRounds` where the cell is read on the rounds. */
export function dashReason(spread: Pick<LineSpread, "apart"> | undefined, day: number, onRounds: boolean): DashReason {
  if (onRounds) return "rounds";
  return spread?.apart.has(day) ? "window" : "none";
}

/** The tooltip on a dash. A line with no data, or no read block, keeps the rounds wording. */
export function dashTitle(reason: DashReason, mainName: string): string {
  return reason === "window"
    ? `Read more than ten minutes from ${mainName} on this day`
    : "No stored round for this line at this moment";
}

/** The largest gap past SPREAD_LIMIT on or after `fromDay`, or null. */
export function gapSince(s: LineSpread, fromDay: number): { day: number; dev: number } | null {
  let out: { day: number; dev: number } | null = null;
  for (const [day, dev] of s.byDay)
    if (day >= fromDay && Math.abs(dev) > SPREAD_LIMIT && (!out || Math.abs(dev) > Math.abs(out.dev)))
      out = { day, dev };
  const l = s.largest;
  if (
    l?.ts != null &&
    l.day >= fromDay &&
    Math.abs(l.dev) > SPREAD_LIMIT &&
    (!out || Math.abs(l.dev) > Math.abs(out.dev))
  )
    out = { day: l.day, dev: l.dev };
  return out;
}

/** "0.8 %", "0.02 %", "12 %". */
export function fmtSpread(dev: number): string {
  const v = Math.abs(dev) * 100;
  const s = v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3);
  return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s} %`;
}

/** "+0.02 %", "−0.8 %", "0 %". */
export function fmtSignedSpread(dev: number): string {
  const s = fmtSpread(dev);
  if (s === "0 %") return s;
  return `${dev > 0 ? "+" : "−"}${s}`;
}
