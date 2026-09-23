// The SparkLend listing's identity search, on its own so both halves of the listing can read it
// without an import cycle: listing-visibility.ts asks it whether the current query names a
// holder (that decides the resting status default), and list-filter-dimensions.tsx maps `q`
// onto the /api/spark/positions `wallet` param. Same shape as the pilots
// (lib/liquity-v2/search.ts, lib/polaris/search.ts).

/** What the search box can name here: a holder address (0x…40). A Spark row is a (wallet,
 *  market) account with no id of its own, and the box resolves no ENS name, so anything else
 *  names no identity. */
export function parseSparkSearch(q: string): { ownerAddress?: string } {
  const v = q.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { ownerAddress: v };
  return {};
}

/** True when the query names a holder — someone looking up an account they know about, as
 *  opposed to browsing the directory. */
export function namesIdentity(q: string | undefined): boolean {
  return Boolean(parseSparkSearch(q ?? "").ownerAddress);
}
