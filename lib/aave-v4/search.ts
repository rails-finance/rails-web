// The Aave V4 listing's identity search, on its own so both halves of the listing can read it
// without an import cycle: listing-visibility.ts asks it whether the current query names a
// holder (that decides the resting status default), and list-filter-dimensions.tsx maps the
// parse onto the spoke-positions fetch params. It used to live in list-filter-dimensions.tsx,
// which imports visibility — hence the move. Same shape as the pilots (lib/liquity-v2/search.ts,
// lib/polaris/search.ts).

/** The wallet / ENS search: an address (0x…40) or an ENS name (….eth), lowercased to match the
 *  old behaviour. A V4 row is a (wallet, spoke) position with no id of its own, so there is no
 *  third mode; anything else applies no identity filter. */
export function parseAaveV4Search(q: string): { wallet?: string; ownerEns?: string } {
  const v = q.trim().toLowerCase();
  if (!v) return {};
  if (/^0x[a-f0-9]{40}$/.test(v)) return { wallet: v };
  if (v.endsWith(".eth")) return { ownerEns: v };
  return {};
}

/** True when the query names a holder — someone looking up a position they know about, as
 *  opposed to browsing the directory. */
export function namesIdentity(q: string | undefined): boolean {
  const { wallet, ownerEns } = parseAaveV4Search(q ?? "");
  return Boolean(wallet ?? ownerEns);
}
