// The Compound V3 wallet read's price wording (ui-jobs 743), for Arbitrum and
// Base alike: every price is a Comet's getPrice at the read block; the WETH
// Comet quotes in ETH, so its price composes with WETH in dollars.

import { priceText } from "@/lib/shared/shown-usd";

/** A USD-quoted Comet's price. */
export const cometPriceNote = (comet: string): string => `${comet}'s getPrice, in dollars`;

/** The ETH-quoted Comet's composed price: its getPrice in ETH times WETH in
 *  dollars, each as shown. `wethFrom` says where the WETH leg was read. */
export function cometComposedPriceNote(o: {
  comet: string;
  ethPrice: number;
  ethUsd: number;
  wethFrom: string;
}): string {
  return `${priceText(o.ethPrice).slice(1)} ETH (${o.comet}'s getPrice, in ETH) × ${priceText(o.ethUsd)} (WETH/USD, ${o.wethFrom}) → USD = getPrice (in ETH) × WETH/USD`;
}

/** Where a Comet has no dollar price: the leg's no-figure words. */
export const cometNoPriceLine = (comets: string[]): string =>
  `no dollar figure: ${comets.join(", ")} ${comets.length === 1 ? "has" : "have"} no conversion to dollars at this read`;
