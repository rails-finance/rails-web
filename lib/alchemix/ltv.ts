// Alchemix states a position's ratio as LTV, the debt over the collateral's
// value, with a Max LTV it may borrow to and a liquidation threshold
// (rails-ops standards/reading-contract.md, rule 4). The Alchemist's getters
// are the inverse: `minimumCollateralization`, `collateralizationLowerBound`
// and `totalValue ÷ debt` are collateral over debt, 1e18-scaled. Every LTV
// figure on the page is one over such a value, and its receipt shows that raw.
//
// Pure.

const WAD = 1e18;

/** LTV as a fraction (0.9 is 90%) from a 1e18-scaled collateral-over-debt
 *  value. Null where there is none or it is not above zero. */
export function ltvOfCollateralization(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const v = Number(raw);
  return v > 0 ? WAD / v : null;
}

/** An LTV fraction as the page prints it: one decimal, "<0.1%" for a debt too
 *  small to show at one decimal. */
export function ltvPrint(fraction: number): string {
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.05) return "<0.1%";
  return `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** One over a 1e18-scaled collateral-over-debt value, printed as an LTV. */
export function ltvPct(raw: string): string {
  const f = ltvOfCollateralization(raw);
  return f == null ? "—" : ltvPrint(f);
}

/** An LTV fraction with the places a receipt's formula shows. */
export function ltvExact(fraction: number): string {
  return `${(fraction * 100).toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}
