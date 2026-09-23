// The Polaris listing's tri-modal identity search, on its own so both halves of
// the listing can read it without an import cycle: listing-visibility.ts asks it
// whether the current query names an identity (that decides the resting status
// default), and list-filter-dimensions.tsx / listing-fetch.ts map the parse onto
// the /api/polaris/positions fetch params. Same shape as the Liquity V2
// counterpart (lib/liquity-v2/search.ts) — the two explorers carry the roster
// rule identically.

/** The tri-modal identity search: a CDP number (all digits), a holder address
 *  (0x…40), or an ENS name (….eth). Anything else names no identity and applies
 *  no filter — the directory answers in full, as free text always has. */
export function parsePolarisSearch(q: string): {
  cdpId?: string;
  ownerAddress?: string;
  ownerEns?: string;
} {
  const v = q.trim();
  if (!v) return {};
  if (/^\d+$/.test(v)) return { cdpId: v };
  if (/^0x[a-fA-F0-9]{40}$/.test(v)) return { ownerAddress: v };
  if (v.toLowerCase().endsWith(".eth")) return { ownerEns: v };
  return {};
}

/** True when the query names a holder (address or ENS) or a CDP number — the
 *  "someone is looking up a position they know about" case, as opposed to
 *  browsing the directory. Free text that names no identity is browsing. */
export function namesIdentity(q: string | undefined): boolean {
  const { cdpId, ownerAddress, ownerEns } = parsePolarisSearch(q ?? "");
  return Boolean(cdpId ?? ownerAddress ?? ownerEns);
}

/** True when the query names a HOLDER specifically — an address or an ENS
 *  name, not a CDP number. The holder strip mounts on this and nothing else: a
 *  CDP-number search is one position, and a wallet summary over it would say
 *  nothing the card does not. */
export function namesHolder(q: string | undefined): boolean {
  const { ownerAddress, ownerEns } = parsePolarisSearch(q ?? "");
  return Boolean(ownerAddress ?? ownerEns);
}
