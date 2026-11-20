// The protocols index's rows and selection (rails-ops decisions 0068 point 2,
// 0069 point 1; ui-jobs 781, 786): one chain at a time, chosen by chain tabs
// (`?chain=<id>`, Ethereum when none or an unknown one is named), one line per
// launched explorer on it, by name, each with its sections, its assets and its
// About as its menu names them. The page builds the rows from the roster (app/(app)/protocols/page.tsx);
// this module reads the URL and narrows them.
//
// Pure: type imports only, so client and server code and the tests read it.

import type { ProtocolType } from "./protocol-types";

export const PROTOCOLS_INDEX_HREF = "/protocols";

/** One of the explorer's sections (H5's entries). */
export interface ProtocolIndexSection {
  href: string;
  name: string;
}

/** One launched explorer: the protocol on the tab's chain. */
export interface ProtocolIndexRow {
  /** The explorer's roster id. */
  id: string;
  label: string;
  type: ProtocolType;
  chainId: number;
  /** The explorer's front door: the line's link. */
  href: string;
  /** Its menu's entries but Assets and About, in menu order: the listing or
   *  Overview, then the sub-pages. */
  sections: ProtocolIndexSection[];
  /** Its Assets page; null where it has none. */
  assetsHref: string | null;
  /** The assets its Assets page lists, one per symbol; null where the read
   *  did not answer. */
  assets: ProtocolIndexAsset[] | null;
  /** A protocol with no fixed asset list (a DEX, trading): "Any token". */
  anyToken: boolean;
  /** Its About page. */
  aboutHref: string;
}

/** An asset an explorer lists, as its Assets page names it. */
export interface ProtocolIndexAsset {
  symbol: string;
  address: string;
  chainId: number;
}

/** The categories with no fixed asset list: a pool or a trade takes any token. */
export const ANY_TOKEN_TYPES: readonly ProtocolType[] = ["dex", "trading"];

export interface ProtocolIndexState {
  chain: number;
  types: ProtocolType[];
}

/** `?chain=` (one chain; the first of a list) and `?type=` (a comma list), as
 *  the page reads them: a chain not in `chains` falls back to the first, an
 *  unknown type is dropped. */
export function protocolIndexState(
  sp: Record<string, string | string[] | undefined>,
  types: readonly ProtocolType[],
  chains: readonly number[],
): ProtocolIndexState {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const asked = Number(one("chain").split(",")[0]);
  return {
    chain: chains.includes(asked) ? asked : chains[0],
    types: one("type")
      .split(",")
      .filter((t): t is ProtocolType => types.includes(t as ProtocolType)),
  };
}

/** The rows the tab, the category and the search keep: the tab's chain; the
 *  category chosen; the search on the name (the Protocol heading's, from sm),
 *  or with `every` on the name or the category's label (the phone's one
 *  search, decision 0070). By name: no ranking (decision 0068). */
export function protocolRowsShown(
  rows: readonly ProtocolIndexRow[],
  s: ProtocolIndexState,
  q: string,
  typeLabel: (t: ProtocolType) => string,
  every = false,
): ProtocolIndexRow[] {
  const want = q.trim().toLowerCase();
  return rows
    .filter(
      (r) =>
        r.chainId === s.chain &&
        (s.types.length === 0 || s.types.includes(r.type)) &&
        (want === "" ||
          r.label.toLowerCase().includes(want) ||
          (every && typeLabel(r.type).toLowerCase().includes(want))),
    )
    .sort((a, b) => a.label.localeCompare(b.label, "en-US"));
}
