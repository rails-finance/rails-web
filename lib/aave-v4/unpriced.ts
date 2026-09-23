// RULE: Rails never invents a price (rails-ops TO-DO-ui-jobs §40 ruling).
//
// A holding whose asset the live price map does not cover has NO USD leg on the
// V4 surface: the row carries the balance in that asset's units, it joins no
// USD total and nothing derived from one, and a total that leaves it out says
// it is partial and names what was left out. `resolvePrice` returns `null` for
// such an asset (lib/aave/prices.ts) — every V4 call site reads that `null` as
// "state the gap", never as a number to substitute for.
//
// This module holds the two things that gap needs: what a USD column shows
// where there is no price, and how a total says it is short of one.

import type { Provenance } from "@/components/shared/provenance";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";

/** What the USD column shows beside a balance with no price behind it. */
export const NO_PRICE_HINT = "no price source";

/** The dust floor for a holding no USD floor can judge, because the asset has
 *  no price. Matches the token epsilon the position simulator uses. */
export const UNPRICED_DUST_TOKENS = 0.0001;

/** What a total's label gains when an unpriced holding is missing from it. */
export const PARTIAL_LABEL_SUFFIX = " (partial)";

/** Whether the live price map has answered at all. An empty map means the page
 *  is still fetching it, which is a loading state and not a missing source, so
 *  the surfaces wait rather than announce a gap none of them can confirm yet.
 *  Once it has answered, an asset absent from it has no price source. */
export function pricesHaveLoaded(prices?: Record<string, unknown>): boolean {
  return prices != null && Object.keys(prices).length > 0;
}

/** "WETH", "WETH and XAUt", "WETH, XAUt and rsETH" — display symbols, joined. */
export function listSymbols(symbols: string[]): string {
  const names = symbols.map(aaveV4DisplaySymbol);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Receipt for the `NO_PRICE_HINT` standing where a row's USD figure would be. */
export function noPriceProv(symbol: string): Provenance {
  const sym = aaveV4DisplaySymbol(symbol);
  return {
    kind: "offchain",
    pclass: "offchain",
    summary: `${sym} has no price source — the live price map carries no entry for this asset, so the row gives the balance in ${sym} and no dollar figure.`,
    via: "no price source",
  };
}

/** A USD total that adds up only the priced holdings: the figure's own receipt,
 *  re-summarised as partial and naming the assets it could not reach. Returns
 *  `base` unchanged when nothing was left out. */
export function partialSumProv(base: Provenance, what: string, excluded: string[]): Provenance {
  if (excluded.length === 0) return base;
  const names = listSymbols(excluded);
  return {
    ...base,
    summary: `${what} is a partial total — it adds up the holdings the live price map covers. It leaves out ${names}, for which there is no price source.`,
    inputs: [
      ...(base.inputs ?? []),
      { label: "left out", kind: "offchain", pclass: "offchain", note: `${names} — no price source` },
    ],
  };
}

/** The total's label with "(partial)" appended when something was left out. */
export function partialLabel(label: string, excluded: string[]): string {
  return excluded.length > 0 ? `${label}${PARTIAL_LABEL_SUFFIX}` : label;
}
