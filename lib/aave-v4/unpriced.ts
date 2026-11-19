// RULE: Rails never invents a price (rails-ops TO-DO-ui-jobs §40 ruling), and
// every V4 dollar stands on an on-chain price (ui-jobs 743).
//
// A holding whose asset has no on-chain price has NO USD leg on the V4
// surface: the row carries the balance in that asset's units, and any total
// including it draws no figure and names the asset. There are no partial
// totals. `resolvePrice` returns `null` for such an asset (lib/aave/prices.ts)
// — every V4 call site reads that `null` as "state the gap", never as a
// number to substitute for.
//
// This module holds the two things that gap needs: what a USD column shows
// where there is no price, and how a total says it is short of one.

import type { Provenance } from "@/components/shared/provenance";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";

/** What the USD column shows beside a balance with no price behind it. */
export const NO_PRICE_HINT = "no on-chain price";

/** Below this many tokens an unpriced balance is the arithmetic residue of
 *  adding event amounts as floats, not a holding. An unpriced holding of any
 *  real size stops every figure it belongs to (ui-jobs 743): at 0.0001 tokens
 *  the old floor passed over about $10 of WBTC. */
export const UNPRICED_DUST_TOKENS = 1e-12;

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
    kind: "derived",
    summary: `${sym} has no on-chain price — no spoke oracle, Chainlink read or Pendle TWAP prices it, so the row gives the balance in ${sym} and no dollar figure.`,
    via: "no on-chain price",
  };
}

/** A USD total that includes an asset with no on-chain price draws no figure
 *  (ui-jobs 743): its receipt names the assets in place of the sum. Returns
 *  `base` unchanged when every asset is priced. */
export function partialSumProv(base: Provenance, what: string, excluded: string[]): Provenance {
  if (excluded.length === 0) return base;
  const names = listSymbols(excluded);
  return {
    kind: "derived",
    summary: `${what} — no dollar figure: ${names} ${excluded.length === 1 ? "has" : "have"} no on-chain price, and a total including ${excluded.length === 1 ? "it" : "them"} is not drawn.`,
    via: "no on-chain price",
  };
}

/** Receipt for the `NO_PRICE_HINT` standing where a ratio would be: a side
 *  holds an asset with no on-chain price, so it has no dollar figure to divide
 *  by or from (no partial totals, ui-jobs 743). */
export function noPriceRatioProv(what: string, side: "collateral" | "debt", excluded: string[]): Provenance {
  const names = listSymbols(excluded);
  return {
    kind: "derived",
    summary: `${what} has no figure at this event — ${names} on the ${side} side has no on-chain price, so that side has no dollar figure to take the ratio from.`,
    via: "no on-chain price",
  };
}
