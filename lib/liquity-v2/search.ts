// The Liquity V2 listing's tri-modal identity search, on its own so both halves
// of the listing can read it without an import cycle: listing-visibility.ts asks
// it whether the current query names an identity (that decides the resting
// status default), and list-filter-dimensions.tsx maps the parse onto the
// /api/troves fetch params. It used to live in list-filter-dimensions.tsx, which
// imports visibility — hence the move.

/** The tri-modal identity search: a trove ID (all digits), an owner address
 *  (0x…40), or an ENS name (….eth). Anything else applies no identity filter
 *  (the backend returns the full set), matching the old search behaviour. */
export function parseTroveSearch(q: string): {
  troveId?: string;
  ownerAddress?: string;
  ownerEns?: string;
} {
  const v = q.trim();
  if (!v) return {};
  if (/^\d+$/.test(v)) return { troveId: v };
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { ownerAddress: v };
  if (v.toLowerCase().endsWith(".eth")) return { ownerEns: v };
  return {};
}

/** True when the query names a holder (address or ENS) or a trove id — the
 *  "someone is looking up a position they know about" case, as opposed to
 *  browsing the directory. Free text that names no identity is browsing. */
export function namesIdentity(q: string | undefined): boolean {
  const { troveId, ownerAddress, ownerEns } = parseTroveSearch(q ?? "");
  return Boolean(troveId ?? ownerAddress ?? ownerEns);
}

/** True when the query names a HOLDER specifically — an address or an ENS
 *  name, not a trove id. The holder strip mounts on this and nothing else: a
 *  trove-id search is one position, and a wallet summary over it would say
 *  nothing the card does not. */
export function namesHolder(q: string | undefined): boolean {
  const { ownerAddress, ownerEns } = parseTroveSearch(q ?? "");
  return Boolean(ownerAddress ?? ownerEns);
}
