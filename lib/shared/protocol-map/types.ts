// A protocol map (ui-jobs 873): a fixed diagram of one protocol, drawn the same
// for every address, filled with one address's activity. Two pieces of data
// drive components/shared/protocol-map/: the LAYOUT, static per protocol, and
// the FILL, built per address on the server. Neither names a protocol here.
//
// Ids are namespaced by protocol ("polaris:cdp"); the address's box is the one
// shared node, `holder`. An edge may join nodes of two protocols, so an edge
// names its `protocol`. The layout lists every possible edge; an edge with
// no fill is drawn dashed, and so is a node no filled edge touches.
//
// "in" and "now" are valuations side by side. The fill has no field for a
// gain. Pure, and imports only types: scripts/test loads it directly.

import type { Provenance } from "../../../components/shared/provenance";

/** The shared node every map draws: the address the page is about. */
export const MAP_HOLDER = "holder";

export type MapBand = "source" | "holder" | "mechanism";

export interface MapNode {
  id: string;
  /** Above the address, the address, below it. */
  band: MapBand;
  /** 1-based grid column, its span and its grid row. */
  col: number;
  span: number;
  row: number;
  /** The protocol's documented term. */
  title: string;
  /** One line of what it does. */
  blurb: string;
  /** Where the protocol's docs explain it. */
  learnMore?: string;
}

export interface MapEdge {
  id: string;
  protocol: string;
  from: string;
  to: string;
  /** Separates a two-way pair (into the zap router, back from it). */
  lane?: -1 | 0 | 1;
  /** Which row place kinds sum into this edge. */
  places: string[];
}

export interface MapLayout {
  id: string;
  /** The grid's width in columns. */
  columns: number;
  nodes: MapNode[];
  edges: MapEdge[];
}

/** An amount of one asset. `address` is the icon's key. */
export interface MapAmount {
  asset: string;
  /** This amount's receipt, where it differs from its line's. */
  receipt?: MapReceipt;
  address?: string;
  raw: string;
  decimals: number;
}

/** A figure's provenance receipt, as the shared Prov renders it, with the
 *  rows a sum covers. The protocol's builder writes it; for a figure another
 *  section of the page also shows, it uses that section's receipt. */
export type MapReceipt = Provenance & { rows?: number };

export interface MapLine {
  label: "in" | "now" | "note";
  amounts: MapAmount[];
  /** Words before the amounts (a note's sentence, an item's name). */
  text?: string;
  /** The amounts' receipt. */
  receipt?: MapReceipt;
}

/** One end of an edge's span: a row's block time (unix seconds) and the id
 *  of the timeline event the row is. */
export interface MapEdgeEnd {
  at: number;
  id: string;
  /** The row was read after the page's first read (`mergeFillRows`). */
  later?: true;
}

export interface MapEdgeFill {
  amounts: MapAmount[];
  rowCount: number;
  timelineHref: string;
  /** The amounts' receipt. */
  receipt: MapReceipt;
  /** The earliest and latest of the rows summed on this edge, over the rows
   *  the fill read (all of them, or the newest `counted.rows`). Absent where
   *  no row carries a time. */
  first?: MapEdgeEnd;
  last?: MapEdgeEnd;
}

/** A row the fill summed: the edges it used and its block time. */
export interface MapFillRow {
  id: string;
  edgeIds: string[];
  at?: number | null;
  /** Read after the page's first read (`mergeFillRows` sets it). */
  later?: true;
}

/** Widens an edge's first and last to take in one row. Ties keep the end
 *  already set, so rows read newest first give the earliest row of a time as
 *  `first` only if it comes later in the list. */
export function spanWith(e: Pick<MapEdgeFill, "first" | "last">, row: MapFillRow): Pick<MapEdgeFill, "first" | "last"> {
  if (row.at == null) return { first: e.first, last: e.last };
  const end: MapEdgeEnd = { at: row.at, id: row.id, ...(row.later ? { later: true as const } : {}) };
  return {
    first: !e.first || row.at <= e.first.at ? end : e.first,
    last: !e.last || row.at > e.last.at ? end : e.last,
  };
}

export interface MapFill {
  subject: { address: string; chain: string; asOf: { block: string | null; time: string | null } };
  /** Each box's lines, and the rows at it over the whole history where the
   *  fill could not sum every row. */
  nodes: Record<string, { lines: MapLine[]; rowCount?: number }>;
  edges: Record<string, MapEdgeFill>;
  /** The rows the fill summed, each naming its edges. */
  rows: MapFillRow[];
  /** How many rows the fill summed, of how many the address has. */
  counted: { rows: number; total: number };
  /** The server does not say which edges the rows used: the map draws no
   *  edges and marks no box untouched. */
  edgesUnknown?: true;
}

export type MapSelection = { type: "node" | "edge" | "row"; id: string } | null;

export interface MapHot {
  any: boolean;
  nodes: Set<string>;
  edges: Set<string>;
  rows: Set<string>;
}

/** The nodes a filled edge touches, the holder always among them. */
export function usedNodes(layout: MapLayout, fill: MapFill): Set<string> {
  const out = new Set<string>([MAP_HOLDER]);
  if (fill.edgesUnknown) for (const n of layout.nodes) out.add(n.id);
  for (const [id, n] of Object.entries(fill.nodes)) if ((n.rowCount ?? 0) > 0) out.add(id);
  for (const e of layout.edges)
    if (fill.edges[e.id]) {
      out.add(e.from);
      out.add(e.to);
    }
  return out;
}

/** What a selection lights: an edge lights its two nodes and its rows; a node
 *  lights its filled edges and theirs; a row lights the edges it used. */
export function hotSets(layout: MapLayout, fill: MapFill, sel: MapSelection): MapHot {
  const out: MapHot = { any: false, nodes: new Set(), edges: new Set(), rows: new Set() };
  if (!sel) return out;
  out.any = true;
  const byId = new Map(layout.edges.map((e) => [e.id, e]));
  const light = (edgeId: string) => {
    const e = byId.get(edgeId);
    if (!e || !fill.edges[edgeId]) return;
    out.edges.add(edgeId);
    out.nodes.add(e.from);
    out.nodes.add(e.to);
  };
  if (sel.type === "edge") light(sel.id);
  else if (sel.type === "node") {
    for (const e of layout.edges) if (e.from === sel.id || e.to === sel.id) light(e.id);
    out.nodes.add(sel.id);
  } else {
    for (const r of fill.rows) if (r.id === sel.id) r.edgeIds.forEach(light);
    out.rows.add(sel.id);
    return out;
  }
  for (const r of fill.rows) if (r.edgeIds.some((id) => out.edges.has(id))) out.rows.add(r.id);
  return out;
}

/** The fill with rows the page read later: each names its edges, and the
 *  row count and each edge's count are recounted over every row. An edge only
 *  the added rows use joins as a count, its link and receipt from `newEdge`,
 *  which the protocol's page supplies. Amounts are summed on the server, and
 *  only over a ledger read in full, so a page with rows left to read has
 *  none. Should an edge carry amounts when rows are added, they are dropped:
 *  an edge never shows a count beside amounts summed over fewer rows. */
export function mergeFillRows(
  fill: MapFill,
  more: MapFillRow[],
  newEdge: (edgeId: string, rowCount: number) => Pick<MapEdgeFill, "timelineHref" | "receipt">,
): MapFill {
  if (fill.edgesUnknown) return fill;
  const seen = new Set(fill.rows.map((r) => r.id));
  const added = more.filter((r) => !seen.has(r.id) && seen.add(r.id)).map((r): MapFillRow => ({ ...r, later: true }));
  if (added.length === 0) return fill;
  const rows = [...fill.rows, ...added];
  const counts = new Map<string, number>();
  for (const r of rows) for (const id of r.edgeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const edges: MapFill["edges"] = {};
  for (const [id, n] of counts) {
    const e = fill.edges[id];
    edges[id] = e ? { ...e, amounts: [], rowCount: n } : { amounts: [], rowCount: n, ...newEdge(id, n) };
  }
  for (const [id, e] of Object.entries(fill.edges)) if (!edges[id]) edges[id] = { ...e, amounts: [], rowCount: 0 };
  // The added rows widen each edge's first and last.
  for (const r of added)
    for (const id of r.edgeIds) {
      const e = edges[id];
      if (!e) continue;
      const span = spanWith(e, r);
      if (span.first) e.first = span.first;
      if (span.last) e.last = span.last;
    }
  return { ...fill, rows, edges, counted: { ...fill.counted, rows: rows.length } };
}

/** The legend's words for a dashed arrow: over every row, unused; over the
 *  newest rows only, unused among them. */
export function mapUnusedWords(fill: MapFill): string {
  const { rows, total } = fill.counted;
  return rows < total
    ? `Not used in the newest ${rows.toLocaleString("en-US")} ${rows === 1 ? "transaction" : "transactions"}`
    : "Not used by this address";
}

/** An amount as an exact decimal string. */
export function mapExact(a: MapAmount): string {
  const v = BigInt(a.raw);
  const neg = v < BigInt(0);
  const abs = neg ? -v : v;
  const base = BigInt(10) ** BigInt(a.decimals);
  const frac = (abs % base).toString().padStart(a.decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${(abs / base).toString()}${frac ? `.${frac}` : ""}`;
}

/** An amount as a number of tokens. */
export const mapUnits = (a: MapAmount): number => Number(mapExact(a));

/** The query param that filters an address's timeline to one edge, or to
 *  several, comma-separated. */
export const MAP_EDGE_PARAM = "map";

/** The edges a `?map=` value names that the fill has, in its order, once each. */
export function mapEdgesFromParam(raw: string | null, fill: MapFill): string[] {
  if (!raw) return [];
  const ids = raw.split(",").map((x) => x.trim());
  return ids.filter((id, i) => id !== "" && fill.edges[id] != null && ids.indexOf(id) === i);
}

// ── The explanation drawer (ui-jobs 873.5) ─────────────────────────────────
// Under the legend, the map's plain-language account of the address: tabs of
// grouped bullets the protocol builds from its fill (Polaris:
// lib/polaris/peth-map-explanation.ts) and the shared map draws. A bullet is
// text and parts: each figure is a fill amount drawn bold with its receipt,
// each time a link to its event on the timeline.

/** A time in the account, as the drawer prints it: "at T", or "from T1 to
 *  T2". Each end's text is set by the builder (the first time in the drawer
 *  carries its date, a later one on the same day the time alone), and links
 *  to its event on the timeline. Counts as one word and one figure. */
export interface MapWhen {
  from: { text: string; href: string };
  to?: { text: string; href: string };
  /** Starts the bullet: "At", "From". */
  cap?: boolean;
}

export type MapTextPart =
  | string
  /** A series: "a", "a and b", "a, b and c". Its commas list, and join no clause. */
  | { list: string[] }
  /** A fill amount, bold, with the receipt the map shows it with. */
  | { figure: MapAmount; receipt?: MapReceipt }
  | { when: MapWhen }
  | { link: string; href: string };

export interface MapBullet {
  parts: MapTextPart[];
  /** The protocol's key for a "?" modal, drawn after the bullet. */
  learnMore?: string;
}

export interface MapExplanationGroup {
  /** A stable name for the group (`data-map-explanation-group`). */
  id: string;
  heading?: string;
  /** A sentence before the bullets. */
  lead?: MapTextPart[];
  bullets: MapBullet[];
}

/** One tab of the drawer: its label and its groups. The first tab opens. */
export interface MapExplanationTab {
  key: string;
  label: string;
  groups: MapExplanationGroup[];
}

export interface MapExplanation {
  tabs: MapExplanationTab[];
}

/** A part as plain text, a figure by `figure`. */
export function mapPartText(p: MapTextPart, figure: (a: MapAmount) => string): string {
  if (typeof p === "string") return p;
  if ("list" in p) return mapSeries(p.list);
  if ("figure" in p) return `${figure(p.figure)} ${p.figure.asset}`;
  if ("link" in p) return p.link;
  const { from, to, cap } = p.when;
  return to ? `${cap ? "From" : "from"} ${from.text} to ${to.text}` : `${cap ? "At" : "at"} ${from.text}`;
}

/** "a", "a and b", "a, b and c". */
export function mapSeries(xs: string[]): string {
  return xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}
