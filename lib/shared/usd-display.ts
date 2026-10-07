// Whether an amount's USD value shows beside it on the timeline (rails-ops
// standards/detail-page-anatomy.md, "USD values on the timeline"). A USD value
// shows beside every amount the timeline prices, stablecoins included; the
// Display menu has no USD switch.
//
// A dollar stablecoin priced off $1 at the event states its price beside its
// USD figure ("$1,049,500 at $0.987"), and one more than DEPEG_BAND off $1
// draws that figure in the caution orange (rails-ops standards/color-grammar.md
// §5, CAUTION; ui-jobs 283). `offPar` is the rule; every shared USD figure on
// the event card reads it (components/shared/usd-figure.tsx).

import { isStableDenominated } from "@/lib/aave-v4/asset-class";

/** How far from $1 a stablecoin's price at the event may sit before its USD
 *  figure takes the caution orange. */
export const DEPEG_BAND = 0.01;

/** Whether a USD value shows: whenever one is priced. */
export function usdShown(usd: number | null | undefined): boolean {
  return usd != null && Number.isFinite(usd);
}

/** The line under a closed cell's USD tooltip: "At the event’s price, $2,431.20
 *  per ETH". Null where the price is not a positive finite number. */
export function eventPriceText(price: number | null | undefined, symbol: string): string | null {
  return priceLine("At the event’s price", price, symbol);
}

function priceLine(lead: string, price: number | null | undefined, symbol: string): string | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const digits = price >= 1 ? 2 : price >= 0.01 ? 4 : 6;
  return `${lead}, $${price.toLocaleString("en-US", { minimumFractionDigits: price >= 1 ? 2 : 0, maximumFractionDigits: digits })} per ${symbol}`;
}

/** A stablecoin whose face is one dollar: the stable-denominated list less the
 *  euro stables, the Pendle principal tokens and the yield-bearing shares
 *  (sUSDe, sDAI, stcUSD, ysyBOLD, syrupUSDC), which are worth more or less
 *  than $1 by design. */
export function isDollarStable(symbol: string): boolean {
  return isStableDenominated(symbol) && !/eur/i.test(symbol) && !/^(s|ys|PT-)/.test(symbol);
}

/** A dollar stablecoin off par at the event: the price as stated beside the
 *  figure ("at $0.987", three decimals), and whether it sits beyond
 *  DEPEG_BAND. */
export interface OffPar {
  text: string;
  band: boolean;
}

/** Null for any other token, for no price, or for a price that reads $1.000. */
export function offPar(price: number | null | undefined, symbol: string | null | undefined): OffPar | null {
  if (!symbol || price == null || !Number.isFinite(price) || price <= 0 || !isDollarStable(symbol)) return null;
  const shown = price.toFixed(3);
  if (shown === "1.000") return null;
  return { text: `at $${shown}`, band: Math.abs(price - 1) - DEPEG_BAND > 1e-12 };
}
