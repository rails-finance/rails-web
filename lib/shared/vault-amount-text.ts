// The Vaults section's PRINT RULES — the one copy of them.
// ----------------------------------------------------------------------------
// Every surface in the section prints the same wei the same way: the two vault
// pages and their listings, the position card, the context strip, and the
// share card an unfurl renders. The rules lived in
// components/protocol/morpho-base/vault-exposure-parts.tsx, which is a "use
// client" module — so a SERVER caller (an `opengraph-image.tsx`, or a page
// building strings for a card's props) could not call them at all, and the only
// way to have them was to write a second copy. A second copy is exactly what
// that file's own header warns against: the amount rule was got wrong once in a
// way no wei-exact check caught, because the verifier had restated the same
// wrong contract.
//
// So the rules moved HERE, where both runtimes can read them, and the client
// module re-exports them. Nothing about the rules changed in the move.

import { formatUnitsExact } from "@/lib/utils/format";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

/** An amount of a vault's asset. Two decimal places for a six-decimal asset
 *  (cents); six for an 18-decimal one. The unit is named beside the figure,
 *  never merged into it. A non-zero amount that would round to nothing is
 *  printed exactly from its raw units instead — a leg holding 1 wei of WETH is
 *  a leg with a balance, and "0.00" would state that it has none. */
export const assetText = (a: RawAmount, decimals: number) => {
  const text = a.value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  return a.value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? formatUnitsExact(a.raw, decimals) : text;
};

/** A share count, to six decimals. The same rule as `assetText`: a balance that
 *  would print as "0" is printed exactly instead. Keyed on the magnitude, not on
 *  the holder's fraction of the vault — the sole holder of a 1-wei vault holds
 *  100% of it and still holds 0.000000000000000001 shares. */
export const shareText = (a: RawAmount, decimals: number) => {
  const text = a.value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return a.value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? formatUnitsExact(a.raw, decimals) : text;
};

/** A percentage to four significant figures. Only ever called above the dust
 *  threshold, where four figures is a real reading rather than a row of zeroes. */
export const pctText = (fraction: number) => `${(fraction * 100).toPrecision(4)}%`;

export const shortId = (id: string) => `${id.slice(0, 10)}…${id.slice(-6)}`;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
