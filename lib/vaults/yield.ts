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
// A one-off move (ui-jobs 542, Miles's ruling of 8 Nov 2026): a span of up to
// 7 days between two stored days whose change is more than half the window's,
// either sign, is named on the subline; the figure stays. A
// vault whose total assets are under 10,000 raw units is too small to
// measure: one raw unit of rounding is more than 0.01% of its share price, and
// its figure is replaced (decision 0047 point 4).
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
      /** The one-off move: the span of up to 7 days whose change is more than
       *  half the window's (decision 0047 point 2, ui-jobs 542).
       *  `day` is the span's later stored day, `fromDay` its earlier one where
       *  the span is more than one day, `change` the span's change, a fraction. */
      jump?: VaultYieldJump;
    }
  | { none: "young"; firstDay: number }
  | { none: "no-series" }
  /** Total assets under the dust floor: the figure is replaced. */
  | { none: "too-small" };

export interface VaultYieldJump {
  day: number;
  fromDay?: number;
  change: number;
}

export const YIELD_WINDOW_DAYS = 30;

/** The dust floor: a vault whose `totalAssets()` is under 10,000 raw units is
 *  too small to measure (ui-jobs 542). */
export const MEASURABLE_MIN_ASSETS_RAW = BigInt(10_000);

export function tooSmallToMeasure(totalAssetsRaw: string | bigint): boolean {
  return BigInt(totalAssetsRaw) < MEASURABLE_MIN_ASSETS_RAW;
}

/** The longest span a one-off move may cover, in days. */
export const JUMP_SPAN_DAYS = 7;
/** How many times the rest of the window's pace a span of days must run. */
const JUMP_PACE = 20;

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

/** Every stored read of one series, oldest first: the readout's longer
 *  windows (lib/vaults/health.ts) read the same rows the window does. */
export const seriesReads = (
  series: VaultSeries | null | undefined,
  { zeroIsRead = true }: { zeroIsRead?: boolean } = {},
): VaultYieldRead[] =>
  (series?.obs ?? [])
    .map((o) => readOf(o, zeroIsRead))
    .filter((r): r is VaultYieldRead => r != null)
    .sort((a, b) => a.day - b.day);

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
  const reads = seriesReads(series, { zeroIsRead });
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
  // The one-off move. One day: the largest step between two stored days, where
  // it is more than half the window's move, either sign (decision 0047 point
  // 2). Up to 7 days (ui-jobs 542): the span with the largest move, its ends
  // trimmed of ordinary days (a step against the move, or under twice the
  // window's average day), where that move is more than half the window's and
  // runs at least 20 times the rest of the window's pace, day for day: a
  // vault whose rate merely varies spreads its month over many days. Named on
  // the subline, never capped or hidden. A move that would print as 0.00%
  // names nothing: on a flat series any rounding wobble is "more than half" of
  // a change of nothing.
  const carries = (move: number) => Math.abs(move) > Math.abs(change) / 2 && Math.abs(move) >= JUMP_FLOOR;
  let step: { j: number; move: number } | undefined;
  let best: { i: number; j: number; move: number } | undefined;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length && points[j].day - points[i].day <= JUMP_SPAN_DAYS; j++) {
      const move = ratioOf(points[i], points[j]) - 1;
      if (best == null || Math.abs(move) > Math.abs(best.move)) best = { i, j, move };
      if (j === i + 1 && (step == null || Math.abs(move) > Math.abs(step.move))) step = { j, move };
    }
  }
  let named: VaultYieldJump | undefined;
  if (best && carries(best.move)) {
    const ordinary = (2 * Math.abs(change)) / days;
    const plain = (k: number) => {
      const s = ratioOf(points[k], points[k + 1]) - 1;
      return Math.sign(s) !== Math.sign(best!.move) || Math.abs(s) < ordinary;
    };
    let { i, j } = best;
    while (j - i > 1 && plain(i)) i++;
    while (j - i > 1 && plain(j - 1)) j--;
    const move = ratioOf(points[i], points[j]) - 1;
    const span = points[j].day - points[i].day;
    const rest = (1 + change) / (1 + move) - 1;
    const concentrated =
      j - i === 1 ||
      Math.sign(rest) !== Math.sign(move) ||
      Math.abs(move / span) >= JUMP_PACE * Math.abs(rest / (days - span));
    if (carries(move) && concentrated)
      named = { day: points[j].day, ...(j - i > 1 ? { fromDay: points[i].day } : {}), change: move };
  }
  if (named == null && step && carries(step.move)) named = { day: points[step.j].day, change: step.move };
  return { yearly: (change * 365) / days, change, days, from, to, ...(named ? { jump: named } : {}) };
}

/** A Yield as a vault's page or row draws it: a figure on total assets
 *  under the dust floor is replaced. Unread total assets leave it as it is. */
export function measuredYield(
  y: VaultYield | undefined,
  totalAssetsRaw: string | null | undefined,
): VaultYield | undefined {
  return y && "yearly" in y && totalAssetsRaw != null && tooSmallToMeasure(totalAssetsRaw) ? { none: "too-small" } : y;
}

/** ", +68% of it on 3 Oct" or ", +99.5% of it from 27 Oct to 3 Nov", with
 *  `day` printing a stored day. */
export const jumpTail = (jump: VaultYieldJump, day: (d: number) => string): string =>
  `, ${changeText(jump.change)} of it ${jump.fromDay != null ? `from ${day(jump.fromDay)} to ${day(jump.day)}` : `on ${day(jump.day)}`}`;

/** "5.1% a year", to one decimal; a fall prints its minus. */
export const yieldText = (yearly: number): string =>
  `${(yearly * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% a year`;

/** "+0.42%": the window's change, signed, to two decimals. */
export const changeText = (change: number): string => {
  const pct = (change * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return change > 0 ? `+${pct}%` : `${pct}%`;
};
