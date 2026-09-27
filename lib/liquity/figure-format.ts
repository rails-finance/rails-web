// The Liquity V2 opened card's figure formats, in one place. The card's T2 grid
// (components/protocol/liquity/liquity-event-detail.tsx) writes its figures
// through these, and the T3 explanation (lib/liquity/explainer-clauses.tsx)
// writes any figure that echoes the grid through the same function, so the two
// read alike at a glance (the T3 echo-colour rule, rails-ops
// standards/detail-page-anatomy.md, "The disclosure ladder").

/** A debt amount: whole units from a thousand up, up to two places below. */
export function fmtDebt(n: number): string {
  if (Math.abs(n) < 0.01) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** A collateral amount: four places, grouped. */
export function fmtColl(n: number): string {
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** A dollar value in the value pill or the price chip: whole dollars. */
export function fmtUsdWhole(value: number | undefined | null): string {
  if (value == null || isNaN(value) || value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Accrued interest on the debt cell's sub-line: two places, grouped. */
export function fmtAccrued(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** An annual interest rate as the rate cell writes it ("4.1%"). */
export function fmtRate(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/** A collateral ratio as the ratio cell writes it in its default mode ("179.34%"). */
export function fmtCr(pct: number): string {
  return `${pct.toFixed(2)}%`;
}
