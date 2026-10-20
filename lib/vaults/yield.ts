// A vault's Yield: its share price's growth over 30 days, annualised simply,
// from the daily store (rails-ops decision 0047), and the one window every
// daily vault series is read through (ui-jobs 413: the "last 30 days" strip).
// ----------------------------------------------------------------------------
// The window: `to` is the latest stored day, `from` the latest stored day at
// least 30 days before it, `d` the days between them. A missing day widens
// `d` (the next stored day back is taken); a day with no row is a gap, and
// nothing is filled or estimated. A series younger than the window has no
// `from` and reports its first day. `seriesWindow` takes any series; the
// share price, total assets and holders all go through it.
//
// The Yield figure on that window, from the share price:
//
//   yearly = (p1 / p0 − 1) × 365 / d
//
// The two reads, each with its day, block and raw value, are the receipt.
//
// Pure, with no imports: the row, the card, the strip and
// scripts/test/vault-yield.test.mjs read it.

/** The store's observation: [UTC day, price_raw, block], raw and block as strings. */
export type VaultSeriesObs = readonly [day: number, raw: string | null, block: string | number | null, ...unknown[]];

/** One vault's series as `/api/prices/daily` answers it. */
export interface VaultSeries {
  /** The series' first day in the store; the answer's window may start later. */
  firstDay?: number | null;
  obs?: readonly VaultSeriesObs[];
}

/** One stored read. */
export interface VaultYieldRead {
  day: number;
  block: number;
  /** `convertToAssets(10 ** decimals)` as stored, in the asset's raw units. */
  raw: string;
}

export type VaultYield =
  | {
      /** The annualised figure, a fraction (0.051 = 5.1% a year). */
      yearly: number;
      /** The share price's change over the window, a fraction (0.0042 = +0.42%). */
      change: number;
      /** Days between the two reads: 30, or more where a day is missing. */
      days: number;
      from: VaultYieldRead;
      to: VaultYieldRead;
      /** The window's largest move between two stored days, where its size is
       *  more than half the window's change: `day` is the later day, `change`
       *  that step's change, a fraction (decision 0047 point 2). */
      jump?: { day: number; change: number };
    }
  | { none: "young"; firstDay: number }
  | { none: "no-series" };

export const YIELD_WINDOW_DAYS = 30;

/** The smallest step the subline names: 0.005%, the least changeText prints
 *  as other than 0.00%. */
const JUMP_FLOOR = 0.00005;

const SCALE = BigInt(10) ** BigInt(18);

function readOf(o: VaultSeriesObs, zeroIsRead: boolean): VaultYieldRead | null {
  const [day, raw, block] = o;
  if (raw == null || !/^\d+$/.test(raw)) return null;
  if (!zeroIsRead && BigInt(raw) === BigInt(0)) return null;
  const b = Number(block);
  if (!Number.isFinite(b)) return null;
  return { day, block: b, raw };
}

// The ratio in 18-place fixed point, so two 30-digit raws divide exactly
// enough before the one conversion to a float.
const ratioOf = (a: VaultYieldRead, b: VaultYieldRead) =>
  Number((BigInt(b.raw) * SCALE) / BigInt(a.raw)) / Number(SCALE);

/** One series' 30-day window. `points` are the stored days the line draws:
 *  from `from` to `to`, or every stored day of a young series. */
export type SeriesWindow =
  | {
      from: VaultYieldRead;
      to: VaultYieldRead;
      /** Days between the two reads: 30, or more where a day is missing. */
      days: number;
      /** `to / from − 1`, a fraction; null where `from` is zero (no ratio). */
      change: number | null;
      points: VaultYieldRead[];
    }
  | { none: "young"; firstDay: number; points: VaultYieldRead[] }
  | { none: "no-series" };

/**
 * The window over one series. `zeroIsRead` says whether a zero row is a
 * value (total assets: an empty vault) or no answer (the share price, whose
 * ratio a zero cannot carry).
 */
export function seriesWindow(
  series: VaultSeries | null | undefined,
  { zeroIsRead = true }: { zeroIsRead?: boolean } = {},
): SeriesWindow {
  const reads = (series?.obs ?? [])
    .map((o) => readOf(o, zeroIsRead))
    .filter((r): r is VaultYieldRead => r != null)
    .sort((a, b) => a.day - b.day);
  if (reads.length === 0) return { none: "no-series" };
  const to = reads[reads.length - 1];
  const target = to.day - YIELD_WINDOW_DAYS;
  let from: VaultYieldRead | null = null;
  for (const r of reads) {
    if (r.day > target) break;
    from = r;
  }
  if (from == null) {
    const firstDay = series?.firstDay ?? reads[0].day;
    // A series that began inside the window is young; one that began before it
    // but has no read in the answer's span is not one this answer can measure.
    return firstDay > target ? { none: "young", firstDay, points: reads } : { none: "no-series" };
  }
  const start = from;
  return {
    from,
    to,
    days: to.day - from.day,
    change: BigInt(from.raw) === BigInt(0) ? null : ratioOf(from, to) - 1,
    points: reads.filter((r) => r.day >= start.day && r.day <= to.day),
  };
}

/** The window over the series a store answer holds under `key`. */
export const vaultWindow = (
  answer: Readonly<Record<string, VaultSeries>> | null | undefined,
  key: string,
  opts?: { zeroIsRead?: boolean },
): SeriesWindow => seriesWindow(answer?.[key], opts);

export function vaultYield(series: VaultSeries | null | undefined): VaultYield {
  const w = seriesWindow(series, { zeroIsRead: false });
  if ("none" in w) return w.none === "young" ? { none: "young", firstDay: w.firstDay } : w;
  const { from, to, days, points } = w;
  const change = w.change!;
  // The step between two stored days that carries most of the window's move,
  // either sign: named on the subline, never capped or hidden.
  let jump: { day: number; change: number } | undefined;
  for (let i = 1; i < points.length; i++) {
    const step = ratioOf(points[i - 1], points[i]) - 1;
    if (jump == null || Math.abs(step) > Math.abs(jump.change)) jump = { day: points[i].day, change: step };
  }
  // A step that would print as 0.00% names nothing: on a flat series any
  // rounding wobble is "more than half" of a change of nothing.
  const named =
    jump != null && Math.abs(jump.change) > Math.abs(change) / 2 && Math.abs(jump.change) >= JUMP_FLOOR
      ? jump
      : undefined;
  return { yearly: (change * 365) / days, change, days, from, to, ...(named ? { jump: named } : {}) };
}

/** "5.1% a year", to one decimal; a fall prints its minus. */
export const yieldText = (yearly: number): string =>
  `${(yearly * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% a year`;

/** "+0.42%": the window's change, signed, to two decimals. */
export const changeText = (change: number): string => {
  const pct = (change * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return change > 0 ? `+${pct}%` : `${pct}%`;
};
