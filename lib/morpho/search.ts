// The Morpho Blue listing's identity search, on its own so both halves of the listing can read
// it without an import cycle: listing-visibility.ts asks it whether the current query names an
// identity (that decides the resting status default), and list-filter-dimensions.tsx maps `q`
// onto /api/morpho/positions's `user` param. Same shape as the pilots
// (lib/liquity-v2/search.ts, lib/polaris/search.ts).

/** What the search box can name here: a holder address (0x…40). the box also takes a market
 *  name or a market id, and neither names a holder or a position — a market query is browsing
 *  one slice of the directory, so the resting view holds there, and the box resolves no ENS
 *  name, so anything else names no identity. */
export function parseMorphoSearch(q: string): { ownerAddress?: string } {
  const v = q.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { ownerAddress: v };
  return {};
}

/** True when the query names a holder — someone looking up a position they know about, as
 *  opposed to browsing the directory. */
export function namesIdentity(q: string | undefined): boolean {
  return Boolean(parseMorphoSearch(q ?? "").ownerAddress);
}
