// Compound V3's price wording (ui-jobs 743), for every deployment: the card,
// the wallet strips and /wallet. Every price is a Comet's getPrice at its read's block; the WETH
// Comet quotes in ETH, so its price composes with WETH in dollars.

import { priceText } from "@/lib/shared/shown-usd";

const at = (block: number | null | undefined) => (block != null ? ` at block ${block.toLocaleString("en-US")}` : "");

/** A USD-quoted Comet's price; `block` where the receipt names a block per row. */
export const cometPriceNote = (comet: string, block?: number | null): string =>
  `${comet}'s getPrice, in dollars${at(block)}`;

/** The ETH-quoted Comet's composed price: its getPrice in ETH times WETH in
 *  dollars, each as shown. `wethFrom` says where the WETH leg was read. */
export function cometComposedPriceNote(o: {
  comet: string;
  ethPrice: number;
  ethUsd: number;
  wethFrom: string;
  block?: number | null;
}): string {
  return `${priceText(o.ethPrice).slice(1)} ETH (${o.comet}'s getPrice, in ETH${at(o.block)}) × ${priceText(o.ethUsd)} (WETH/USD, ${o.wethFrom})`;
}

/** Why a Comet has no dollar price: its getPrice answered zero, or it
 *  quotes in ETH and the read carries no WETH in dollars. */
export type CometUnpriced = { comet: string; why: "zero" | "conversion" };

/** Where a leg holds an unpriced Comet: the no-figure words, each cause named. */
export function cometNoPriceLine(unpriced: readonly CometUnpriced[]): string {
  const zero = unpriced.filter((u) => u.why === "zero").map((u) => u.comet);
  const conv = unpriced.filter((u) => u.why === "conversion").map((u) => u.comet);
  const parts = [
    zero.length ? `${zero.join(", ")}'s getPrice answered zero at this read` : null,
    conv.length
      ? `${conv.join(", ")} ${conv.length === 1 ? "quotes" : "quote"} in ETH and the read carries no WETH in dollars to convert at`
      : null,
  ].filter(Boolean);
  return `no dollar figure: ${parts.join("; ")}`;
}
