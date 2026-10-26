// The spread between an asset page's lines (rails-ops reference/asset-key-map.md,
// "The spread"): each line's daily deviation from the chart's main line, in
// percent, and where it passes SPREAD_LIMIT, its largest gap.
//
// A day compares two lines only where both were read within READ_WINDOW_S of
// each other (from the blocks the daily store names), or where either is a
// constant: two reads hours apart measure the market moving between them,
// not the oracles. Pure; the asset chart and the Prices list's flags read it.

/** Lines further apart than this are named (1 %): two feeds that each update
 *  on a 0.5 % move can stand up to 1 % apart with neither wrong, and the
 *  majors' Chainlink lines read within ten minutes stay inside it. */
export const SPREAD_LIMIT = 0.01;
/** Two reads within ten minutes are one moment. */
export const READ_WINDOW_S = 600;
const BLOCK_S: Record<number, number> = { 1: 12, 8453: 2 };

/** `[day, price, block]`, ascending by day. */
export type SpreadPoint = readonly [number, number, number | null, ...unknown[]];

export interface SpreadLine {
  key: string;
  points: readonly SpreadPoint[];
  /** A constant: compared whatever block it was read at. */
  fixed?: boolean;
}

export interface LineSpread {
  key: string;
  /** Day → the line's price over the main line's, less one. */
  byDay: Map<number, number>;
  /** The largest gap, by size. Null where no day compares. */
  largest: { day: number; dev: number } | null;
  /** Whether any day passes SPREAD_LIMIT. */
  passes: boolean;
}

/** Each other line's deviation from `main`, day by day. */
export function lineSpreads(main: SpreadLine, others: readonly SpreadLine[], chain: number): LineSpread[] {
  const window = READ_WINDOW_S / (BLOCK_S[chain] ?? 12);
  const at = new Map(main.points.map((p) => [p[0], p]));
  return others.map((o) => {
    const byDay = new Map<number, number>();
    let largest: LineSpread["largest"] = null;
    for (const p of o.points) {
      const q = at.get(p[0]);
      if (!q || !(q[1] > 0) || !(p[1] > 0)) continue;
      const timed = !main.fixed && !o.fixed;
      if (timed && (p[2] == null || q[2] == null || Math.abs(p[2] - q[2]) > window)) continue;
      const dev = p[1] / q[1] - 1;
      byDay.set(p[0], dev);
      if (!largest || Math.abs(dev) > Math.abs(largest.dev)) largest = { day: p[0], dev };
    }
    return { key: o.key, byDay, largest, passes: largest != null && Math.abs(largest.dev) > SPREAD_LIMIT };
  });
}

/** The largest gap past SPREAD_LIMIT on or after `fromDay`, or null. */
export function gapSince(s: LineSpread, fromDay: number): { day: number; dev: number } | null {
  let out: { day: number; dev: number } | null = null;
  for (const [day, dev] of s.byDay)
    if (day >= fromDay && Math.abs(dev) > SPREAD_LIMIT && (!out || Math.abs(dev) > Math.abs(out.dev)))
      out = { day, dev };
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
