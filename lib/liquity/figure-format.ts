// The Liquity V2 opened card's figure formats, in one place. The card's T2 grid
// (components/protocol/liquity/liquity-event-detail.tsx) writes its figures
// through these, and the T3 explanation (lib/liquity/event-prose.ts)
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

/** An annual interest rate as the rate cell, the header pills and the
 *  explanation write it: two places ("4.12%"). */
export function fmtRate(pct: number): string {
  return `${fmtRateNum(pct)}%`;
}

/** The rate's number without the sign, for a cell that sets the "%" apart. */
export function fmtRateNum(pct: number): string {
  return pct.toFixed(2);
}

/** A delegate's before/after rate for a batch rate-change clause. A step can be
 *  smaller than the rate cell's two decimal places (a batch manager re-affirming
 *  close to its old rate), which at fmtRate's precision reads as the same figure
 *  on both sides. Widens the precision only as far as it takes for the two to
 *  read apart, and reports `changed: false` when the rate is the same value, so
 *  the clause can say "kept" instead of guessing "lowered" from a false `<`. */
export function fmtRateChange(before: number, after: number): { before: string; after: string; changed: boolean } {
  if (before === after) {
    const at = fmtRate(after);
    return { before: at, after: at, changed: false };
  }
  for (let digits = 2; digits <= 6; digits++) {
    const beforeStr = `${before.toFixed(digits)}%`;
    const afterStr = `${after.toFixed(digits)}%`;
    if (beforeStr !== afterStr) return { before: beforeStr, after: afterStr, changed: true };
  }
  return { before: `${before.toFixed(6)}%`, after: `${after.toFixed(6)}%`, changed: true };
}

/** A collateral ratio as the ratio cell writes it in its default mode ("179.34%"). */
export function fmtCr(pct: number): string {
  return `${pct.toFixed(2)}%`;
}
