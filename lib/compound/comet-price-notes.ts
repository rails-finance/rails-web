// Compound V3's price wording (ui-jobs 743), for every deployment: the card,
// the wallet strips and /wallet. Every price is a Comet's getPrice at its read's block; the WETH
// Comet quotes in ETH, so its price composes with WETH in dollars.

import { priceText } from "@/lib/shared/shown-usd";

const at = (block: number | null | undefined) => (block != null ? ` at block ${block.toLocaleString("en-US")}` : "");

/** A USD-quoted Comet's price; `block` where the receipt names a block per row. */
export const cometPriceNote = (comet: string, block?: number | null): string =>
  `${comet}'s getPrice, in dollars${at(block)}`;

/** A Lifetime flows leg's price (ui-jobs 743): the Comet's getPrice (an
 *  ETH-quoted Comet's composed with WETH/USD at the same block) at the
 *  leg's block; a liquidation's AbsorbCollateral usdValue over its amount;
 *  or the nearest read's, both blocks named. */
export function cometFlowPriceNote(o: {
  comet: string;
  priceBlock: number;
  eventBlock: number;
  /** An ETH-quoted Comet's two factors, each shown in the note. */
  factor?: { price: number; ethUsd: number } | null;
}): string {
  const read = o.factor
    ? cometComposedPriceNote({
        comet: o.comet,
        ethPrice: o.factor.price,
        ethUsd: o.factor.ethUsd,
        wethFrom: "the Comet's WETH feed at the same block",
      })
    : `${o.comet}'s getPrice, in dollars`;
  return o.priceBlock === o.eventBlock
    ? `${read}${at(o.eventBlock)}`
    : `${read}, price at block ${o.priceBlock.toLocaleString("en-US")}, the nearest read; this event is at block ${o.eventBlock.toLocaleString("en-US")}`;
}

/** Where a side has no dollar figure: the assets with no price at the block. */
export const cometNoDollarLine = (assets: readonly string[]): string =>
  `no dollar figure: ${assets.length > 1 ? `${assets.slice(0, -1).join(", ")} and ${assets[assets.length - 1]} have` : `${assets[0] ?? "an asset"} has`} no price at this block`;

/** An absorb's collateral leg: the dollars its AbsorbCollateral log states. */
export const cometAbsorbValueNote = (block: number): string =>
  `usdValue in the AbsorbCollateral log, block ${block.toLocaleString("en-US")}`;

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
