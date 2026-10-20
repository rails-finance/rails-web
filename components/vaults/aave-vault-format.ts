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

import { monthShort } from "@/lib/date";
import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import { VAULT_FAMILIES } from "@/lib/vaults/families";

/** The family as a heading names it — the mechanic, not the ticker
 *  (lib/vaults/families.ts names each family once). */
export const AAVE_FAMILY_LABEL: Record<AaveVaultFamily, string> = {
  sgho: VAULT_FAMILIES.sgho.label,
  stata: VAULT_FAMILIES.stata.label,
  "umbrella-stake": VAULT_FAMILIES["umbrella-stake"].label,
};

/** The same, in the singular, for a page about one vault. */
export const AAVE_FAMILY_SINGULAR: Record<AaveVaultFamily, string> = {
  sgho: VAULT_FAMILIES.sgho.singular,
  stata: VAULT_FAMILIES.stata.singular,
  "umbrella-stake": VAULT_FAMILIES["umbrella-stake"].singular,
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
