// The Fluid listing's identity search, on its own so both halves of the listing can read it
// without an import cycle: listing-visibility.ts asks it whether the current query names an
// identity (that decides the resting status default), and list-filter-dimensions.tsx maps `q`
// onto /api/fluid/positions's `wallet` param. Same shape as the pilots
// (lib/liquity-v2/search.ts, lib/polaris/search.ts).

/** What the search box can name here: a position NFT id (all digits), or a holder address
 *  (0x…40). Anything else names no identity. */
export function parseFluidSearch(q: string): { nftId?: string; ownerAddress?: string } {
  const v = q.trim();
  if (!v) return {};
  if (/^\d+$/.test(v)) return { nftId: v };
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { ownerAddress: v };
  return {};
}

/** True when the query names a holder or a single position — someone looking up something they
 *  know about, as opposed to browsing the directory. */
export function namesIdentity(q: string | undefined): boolean {
  const { nftId, ownerAddress } = parseFluidSearch(q ?? "");
  return Boolean(nftId ?? ownerAddress);
}
