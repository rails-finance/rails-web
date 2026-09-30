// Polaris collateral ratios, stated one way on every surface: the card, its
// (i), the rows' chip and metric, the market notes' Polaris cells and the
// export all format through here.
//
// Two rules. Above POLARIS_RATIO_CEILING_PCT a ratio says "over 10,000%": a
// CDP whose debt is a few units against a large collateral has a ratio in the
// millions, and the digits past the ceiling carry nothing a reader can use
// while they swing with every block. Below it the figure carries the site's
// thousands separators ("1,917.7%"), and where rounding to the chosen grain
// would put a ratio on the minimum while it sits under or over it (114.95%
// against 115%), one more decimal is kept until the two read apart.

/** The ceiling, as a percentage. */
export const POLARIS_RATIO_CEILING_PCT = 10_000;

const fixed = (n: number, d: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

/** A ratio given as a percentage (114.95 means 114.95%). `decimals` is the
 *  surface's own grain; `minPct`, where given, is the minimum it is read
 *  against, and the grain widens (up to two decimals) until the two differ. */
export function formatPolarisRatioPct(pct: number, decimals = 1, minPct?: number): string {
  if (!Number.isFinite(pct)) return "—";
  if (pct > POLARIS_RATIO_CEILING_PCT) return `over ${fixed(POLARIS_RATIO_CEILING_PCT, 0)}%`;
  let d = decimals;
  if (minPct != null && pct !== minPct) {
    while (d < 2 && fixed(pct, d) === fixed(minPct, d)) d++;
  }
  return `${fixed(pct, d)}%`;
}

/** The same, for a ratio given as a fraction (1.1495 means 114.95%). */
export const formatPolarisRatio = (fraction: number, decimals = 1, minFraction?: number): string =>
  formatPolarisRatioPct(fraction * 100, decimals, minFraction != null ? minFraction * 100 : undefined);
