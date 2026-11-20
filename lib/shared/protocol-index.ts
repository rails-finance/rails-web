// The protocols index's rows and selection (rails-ops decision 0068 points 2
// and 8; ui-jobs 781): one group per protocol (a version: Aave V3 and Aave V4
// are two), one line per launched explorer in the chain order. The first line
// shown carries the protocol's name and category (Miles, 20 Nov 2026); each
// line is its explorer, with that explorer's assets. The page builds the
// groups from the roster (app/(app)/protocols/page.tsx); this module reads the
// URL and narrows them, a line at a time.
//
// Pure: type imports only, so client and server code and the tests read it.

import type { ProtocolType } from "./protocol-types";

export const PROTOCOLS_INDEX_HREF = "/protocols";

/** An asset an explorer lists, as /assets names it. */
export interface ProtocolIndexAsset {
  symbol: string;
  address: string;
  chainId: number;
}

/** One launched explorer of the protocol: the protocol on one chain. */
export interface ProtocolIndexLine {
  /** The explorer's roster id. */
  id: string;
  chainId: number;
  chainName: string;
  /** The chain's place in the chain order. */
  chainOrder: number;
  /** The explorer's front door: the line's link. */
  href: string;
  /** The assets /assets lists for this explorer, one per symbol; null where
   *  that read did not answer. */
  assets: ProtocolIndexAsset[] | null;
}

export interface ProtocolIndexRow {
  /** The version's key (`protocolKey`, else the first explorer's id). */
  key: string;
  label: string;
  /** The mark's roster id. */
  iconId: string;
  type: ProtocolType;
  /** A protocol with no fixed asset list (a DEX, an order book): "Any token". */
  anyToken: boolean;
  /** In the chain order. */
  lines: ProtocolIndexLine[];
}

export interface ProtocolIndexState {
  chains: string[];
  types: ProtocolType[];
}

/** The categories with no fixed asset list: a pool or a trade takes any token. */
export const ANY_TOKEN_TYPES: readonly ProtocolType[] = ["dex", "trading"];

/** `?chain=` and `?type=`, as the page reads them: comma lists, unknown values
 *  dropped. `types` is the type list (PROTOCOL_TYPE_LABELS' keys). */
export function protocolIndexState(
  sp: Record<string, string | string[] | undefined>,
  types: readonly ProtocolType[],
): ProtocolIndexState {
  const list = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").split(",").filter(Boolean);
  };
  return {
    chains: list("chain").filter((c) => /^[1-9]\d*$/.test(c)),
    types: list("type").filter((t): t is ProtocolType => types.includes(t as ProtocolType)),
  };
}

/** The lines of a group that pass the selection and the search: the chains
 *  chosen keep their lines; the category keeps or drops the group; the search
 *  keeps every line where the name or the category's label matches, else the
 *  lines whose chain's name matches. Empty: the group does not show. */
export function protocolLinesShown(
  row: ProtocolIndexRow,
  s: ProtocolIndexState,
  q: string,
  typeLabel: (t: ProtocolType) => string,
): ProtocolIndexLine[] {
  if (s.types.length > 0 && !s.types.includes(row.type)) return [];
  const lines = s.chains.length === 0 ? row.lines : row.lines.filter((l) => s.chains.includes(String(l.chainId)));
  const want = q.trim().toLowerCase();
  if (want === "" || row.label.toLowerCase().includes(want) || typeLabel(row.type).toLowerCase().includes(want))
    return lines;
  return lines.filter((l) => l.chainName.toLowerCase().includes(want));
}

/** By name: no ranking (decision 0068). */
export function sortProtocolRows(rows: readonly ProtocolIndexRow[]): ProtocolIndexRow[] {
  return [...rows].sort((a, b) => a.label.localeCompare(b.label, "en-US"));
}

/** The launched explorers grouped by version, each group's lines in the
 *  chain order, each line with its explorer's assets. */
export function groupProtocolRows<E extends { id: string; protocolKey?: string; label: string; type: ProtocolType }>(
  entries: readonly E[],
  lineOf: (e: E) => Omit<ProtocolIndexLine, "assets">,
  assetsOf: (id: string) => ProtocolIndexAsset[] | null,
): ProtocolIndexRow[] {
  const groups = new Map<string, E[]>();
  for (const e of entries) {
    const k = e.protocolKey ?? e.id;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  return [...groups.entries()].map(([key, es]) => {
    const anyToken = ANY_TOKEN_TYPES.includes(es[0].type);
    const lines = es
      .map((e) => ({ ...lineOf(e), assets: anyToken ? [] : assetsOf(e.id) }))
      .sort((a, b) => a.chainOrder - b.chainOrder);
    const first = es.find((e) => e.id === lines[0].id) ?? es[0];
    return { key, label: first.label, iconId: first.id, type: first.type, anyToken, lines };
  });
}
