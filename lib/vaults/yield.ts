// A vault's Yield: its share price's growth over 30 days, annualised simply,
// from the daily store (rails-ops decision 0047).
// ----------------------------------------------------------------------------
// `p1` is the latest stored day's share price, `p0` the price on the latest
// stored day at least 30 days before it, `d` the days between them:
//
//   yearly = (p1 / p0 − 1) × 365 / d
//
// A missing day widens `d` (the next stored day back is taken); nothing is
// filled or estimated. A series younger than the window has no figure. The
// two reads, each with its day, block and raw `convertToAssets`, are the
// figure's receipt.
//
// Pure, with no imports: the row, the card and scripts/test/vault-yield.test.mjs
// read it.

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
    }
  | { none: "young"; firstDay: number }
  | { none: "no-series" };

export const YIELD_WINDOW_DAYS = 30;

const SCALE = BigInt(10) ** BigInt(18);

function readOf(o: VaultSeriesObs): VaultYieldRead | null {
  const [day, raw, block] = o;
  if (raw == null || !/^\d+$/.test(raw) || BigInt(raw) === BigInt(0)) return null;
  const b = Number(block);
  if (!Number.isFinite(b)) return null;
  return { day, block: b, raw };
}

export function vaultYield(series: VaultSeries | null | undefined): VaultYield {
  const reads = (series?.obs ?? [])
    .map(readOf)
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
    return firstDay > target ? { none: "young", firstDay } : { none: "no-series" };
  }
  const days = to.day - from.day;
  // The ratio in 18-place fixed point, so two 30-digit raws divide exactly
  // enough before the one conversion to a float.
  const ratio = Number((BigInt(to.raw) * SCALE) / BigInt(from.raw)) / Number(SCALE);
  const change = ratio - 1;
  return { yearly: (change * 365) / days, change, days, from, to };
}

/** "5.1% a year", to one decimal; a fall prints its minus. */
export const yieldText = (yearly: number): string =>
  `${(yearly * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% a year`;

/** "+0.42%": the window's change, signed, to two decimals. */
export const changeText = (change: number): string => {
  const pct = (change * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return change > 0 ? `+${pct}%` : `${pct}%`;
};
