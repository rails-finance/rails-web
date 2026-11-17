// The Polaris listing's tri-modal identity search, on its own so both halves of
// the listing can read it without an import cycle: listing-visibility.ts asks it
// whether the current query names an identity (that decides the resting status
// default), and list-filter-dimensions.tsx / listing-fetch.ts map the parse onto
// the /api/polaris/positions fetch params. Same shape as the Liquity V2
// counterpart (lib/liquity-v2/search.ts) — the two explorers carry the roster
// rule identically.
//
// Each market numbers its CDPs from 1, so a bare number names a CDP in both.
// A market name before it ("usdp:34", "GOLDp #34", "goldp 34") scopes it to one
// (ui-jobs 694); the names are the catalog's market keys and stablecoin
// symbols, matched in any case.

import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";

/** Each market's key and stablecoin symbol, lowercased, to its key. */
const MARKET_NAMES = new Map<string, PolarisMarket>(
  (Object.keys(POLARIS_MARKET_CONFIG) as PolarisMarket[]).flatMap((k) => [
    [k.toLowerCase(), k] as const,
    [POLARIS_MARKET_CONFIG[k].stable.symbol.toLowerCase(), k] as const,
  ]),
);

/** The tri-modal identity search: a CDP number (all digits, optionally after a
 *  market name), a holder address (0x…40), or an ENS name (….eth). Anything
 *  else names no identity and applies no filter — the directory answers in
 *  full, as free text always has. */
export function parsePolarisSearch(q: string): {
  market?: PolarisMarket;
  cdpId?: string;
  ownerAddress?: string;
  ownerEns?: string;
} {
  const v = q.trim();
  if (!v) return {};
  if (/^\d+$/.test(v)) return { cdpId: v };
  const scoped = /^([a-z]+)\s*(?::\s*#?|#)?\s*(\d+)$/i.exec(v);
  const market = scoped ? MARKET_NAMES.get(scoped[1].toLowerCase()) : undefined;
  if (scoped && market) return { market, cdpId: scoped[2] };
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
