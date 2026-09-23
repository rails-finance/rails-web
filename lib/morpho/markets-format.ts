// The markets view's two formatters — the roster's pages and one market's page
// state sizes and ratios the same way.

export const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

/** Loan-token quantities, never USD — Morpho states no dollar value anywhere. */
export function amount(value: number): string {
  if (value === 0) return "0";
  const a = Math.abs(value);
  if (a >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  if (a < 0.001) return value.toExponential(1);
  return value.toLocaleString("en-US", { maximumFractionDigits: a < 1 ? 4 : 2 });
}
