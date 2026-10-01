// A collateral figure at the decimals its card's ledger prints ("1,037.52"),
// for the Explanation's prose. The prose is built by plain functions that have
// no hooks, so the card's decimals are set for the span of one build
// (`withCollDecimals`) and the prose's collateral formatters read them
// (`collFigure`). Synchronous, so nothing outside the build sees them.

import { fmtTokens } from "@/lib/shared/flow-focus";

/** A token figure at `decimals` (as the ledger prints it). Where there are
 *  none, or the figure would round to zero at them, `fallback` stands. */
export function ledgerFigure(n: number, decimals: number | null, fallback: string): string {
  if (decimals == null || !Number.isFinite(n)) return fallback;
  if (n === 0) return "0";
  const text = fmtTokens(n, decimals);
  return Number(text.replace(/,/g, "")) === 0 ? fallback : text;
}

let current: number | null = null;

/** Run one prose build with the collateral ledger's decimals in force. */
export function withCollDecimals<T>(decimals: number | null, build: () => T): T {
  const prior = current;
  current = decimals;
  try {
    return build();
  } finally {
    current = prior;
  }
}

/** A collateral amount: at the ledger's decimals where a build set them, else `fallback`. */
export function collFigure(n: number, fallback: string): string {
  const text = ledgerFigure(n, current, fallback);
  return n < 0 && text !== fallback ? `-${text}` : text;
}
