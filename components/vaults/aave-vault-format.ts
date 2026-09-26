// The print rules the two Aave-on-Ethereum surfaces share.
// ----------------------------------------------------------------------------
// `/ethereum/aave/vaults` lists eighteen vaults one column deep; `/ethereum/aave/vaults/
// <vault>` states one of them in full. The two must print the SAME wei the same
// way — a reader who follows a row into its page and reads a different share
// price has been told two things — so the rules live here once rather than
// twice, exactly as the Base pair keeps its amount rule in one file
// (components/protocol/morpho-base/vault-exposure-parts.tsx, whose `assetText`
// and `shareText` both surfaces here also use).
//
// Every call names its locale: "en-US" for numbers, "en-GB" + UTC for dates.
// These render on the server AND in the browser, and an unpinned format writes
// different markup in each.

import { formatUnitsExact } from "@/lib/utils/format";
import { monthShort } from "@/lib/date";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";

/** The family as a heading names it — the mechanic, not the ticker. */
export const AAVE_FAMILY_LABEL: Record<AaveVaultFamily, string> = {
  sgho: "Savings GHO",
  stata: "Static aTokens",
  "umbrella-stake": "Umbrella stake tokens",
};

/** The same, in the singular, for a page about one vault. */
export const AAVE_FAMILY_SINGULAR: Record<AaveVaultFamily, string> = {
  sgho: "Savings GHO",
  stata: "Static aToken",
  "umbrella-stake": "Umbrella stake token",
};

/** A SHARE PRICE, which is not an amount and does not print like one.
 *
 *  `assetText` keys on the asset's own decimals — two places for a 6-decimal
 *  asset, because that is what a payment in it can express. A share price is a
 *  ratio-shaped quantity that sits near one: printed to two places, every
 *  static aToken in this section would read "1.17" or "1.18" and two vaults
 *  with different prices would be indistinguishable. So the rule is the amount
 *  rule with six places allowed whatever the asset is —
 *  `convertToAssets(10^6)` answering 1,184,649 is exactly 1.184649 USDC,
 *  invented precision nowhere — and a non-zero figure that would still round to
 *  nothing is printed exactly from its raw units. */
export const sharePriceText = (a: RawAmount, decimals: number) => {
  const text = a.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return a.value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? formatUnitsExact(a.raw, decimals) : text;
};

/** A duration in the contract's own seconds, said in the largest whole unit it
 *  divides into — the seconds stay in the receipt, which is where a reader who
 *  wants to check the call finds them. */
export function durationText(seconds: number): string {
  const n = (v: number) => v.toLocaleString("en-US");
  if (seconds % 86400 === 0) return `${n(seconds / 86400)} ${seconds === 86400 ? "day" : "days"}`;
  if (seconds % 3600 === 0) return `${n(seconds / 3600)} ${seconds === 3600 ? "hour" : "hours"}`;
  return `${n(seconds)} seconds`;
}

/** A block or contract timestamp, as one UTC instant. Both the locale and the
 *  zone are pinned: these are chain timestamps, and two readers of one of them
 *  must be given one time. */
export const utcInstant = (unixSeconds: number): string => {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${monthShort(d.getUTCMonth())} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
};

/** A signed amount, with the sign printed rather than implied. A gap between
 *  two reads can fall either way and the page asserts no order, so a positive
 *  one carries its "+". */
export const signedText = (a: RawAmount, text: string): string => (BigInt(a.raw) > BigInt(0) ? `+${text}` : text);
