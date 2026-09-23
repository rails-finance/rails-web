// The Aave V3 listing's identity search, on its own so both halves of the listing can read it
// without an import cycle: listing-visibility.ts asks it whether the current query names an
// identity (that decides the resting status default), and list-filter-dimensions.tsx maps `q`
// onto /api/aave-v3/positions's `wallet` param. Same shape as the pilots
// (lib/liquity-v2/search.ts, lib/polaris/search.ts).

/** What the search box can name here: a holder address (0x…40). An Aave V3 row is a (wallet,
 *  market) account with no id of its own, and the box resolves no ENS name, so anything else
 *  names no identity. */
export function parseAaveV3Search(q: string): { ownerAddress?: string } {
  const v = q.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { ownerAddress: v };
  return {};
}

/** True when the query names a holder — someone looking up a position they know about, as
 *  opposed to browsing the directory. */
export function namesIdentity(q: string | undefined): boolean {
  return Boolean(parseAaveV3Search(q ?? "").ownerAddress);
}
