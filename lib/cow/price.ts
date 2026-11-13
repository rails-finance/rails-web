// A CoW trade's executed price in the docs' form: "after deducting fees from
// the amount sold" (docs.cow.fi, CoW Explorer, "By order"). A Trade log's
// sellAmount includes its feeAmount (read on chain, rails-ops
// reference/official-docs/cow.md, "Read on chain"), so the price runs on
// sellAmount − feeAmount.

import { shiftDecimal } from "../utils/format";

/** The sold amount less the fee, as a raw integer string; null when the fee
 *  is not below the sold amount. */
export function soldLessFee(sellAmount: string, feeAmount: string): string | null {
  const net = BigInt(sellAmount) - BigInt(feeAmount);
  return net > BigInt(0) ? net.toString() : null;
}

/** The executed price both ways round, each amount scaled by its token's
 *  decimals: bought per unit sold and sold per unit bought, the sold side
 *  less the fee. Null when a side's decimals are not read or an amount is 0. */
export function executedRatio(
  sellAmount: string,
  buyAmount: string,
  feeAmount: string,
  sellDecimals: number | null,
  buyDecimals: number | null,
): { perSell: number; perBuy: number; soldNet: string } | null {
  if (sellDecimals == null || buyDecimals == null) return null;
  const soldNet = soldLessFee(sellAmount, feeAmount);
  if (soldNet == null) return null;
  const s = Number(shiftDecimal(soldNet, sellDecimals));
  const b = Number(shiftDecimal(buyAmount, buyDecimals));
  if (s === 0 || b === 0) return null;
  return { perSell: b / s, perBuy: s / b, soldNet };
}
