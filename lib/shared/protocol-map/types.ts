// A protocol map (ui-jobs 873): a fixed diagram of one protocol, drawn the same
// for every address, filled with one address's activity. Two pieces of data
// drive components/shared/protocol-map/: the LAYOUT, static per protocol, and
// the FILL, built per address on the server. Neither names a protocol here.
//
// Ids are namespaced by protocol ("polaris:cdp"); the address's box is the one
// shared node, `holder`. An edge may join nodes of two protocols, so an edge
// names its `protocol`. The layout lists every possible edge. The map draws
// only the used nodes and filled edges, or with `?routes=all` every one, an
// edge with no fill and a node the address did not use (`usedNodes`) dashed.
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

/** The nodes this address used: the holder, every node a filled edge
 *  touches, and every node with a "now" line or a row count of its own.
 *  With the edges unknown, every node. */
export function usedNodes(layout: MapLayout, fill: MapFill): Set<string> {
  const out = new Set<string>([MAP_HOLDER]);
  if (fill.edgesUnknown) for (const n of layout.nodes) out.add(n.id);
  for (const [id, n] of Object.entries(fill.nodes))
    if ((n.rowCount ?? 0) > 0 || n.lines.some((l) => l.label === "now")) out.add(id);
  for (const e of layout.edges)
    if (fill.edges[e.id]) {
      out.add(e.from);
      out.add(e.to);
    }
  return out;
}

// ── Used routes only (ui-jobs 882) ─────────────────────────────────────────
// By default the map draws only the nodes this address used (`usedNodes`)
// and its filled edges, laid out without gaps; `?routes=all` draws the whole
// layout, the unused parts muted.

/** Where a node sits on the drawn grid: 1-based column, span and row. */
export interface MapCell {
  col: number;
  span: number;
  row: number;
}

/** The grid the map draws: its width in columns, its rows, each drawn node's
 *  cell, and the layout's columns that one grid column stands for. */
export interface MapGrid {
  columns: number;
  rows: number;
  cells: Record<string, MapCell>;
  /** The layout's columns per grid column, for the frame's least width. */
  scale: number;
}

/** The whole layout, as it is written. */
export function mapFullGrid(layout: MapLayout): MapGrid {
  const cells: Record<string, MapCell> = {};
  for (const n of layout.nodes) cells[n.id] = { col: n.col, span: n.span, row: n.row };
  return { columns: layout.columns, rows: Math.max(...layout.nodes.map((n) => n.row)), cells, scale: 1 };
}

/** The layout with only the `shown` nodes. Each row keeps its shown nodes in
 *  layout order, left to right; a row with none is dropped. Every row is
 *  measured in the same unit, a layout column, so a node's span carries over
 *  as its relative width: the grid is as wide as its widest row, and each row
 *  sits centred in it. In the holder's row the nodes left of the holder sit
 *  left of it and the rest right, with the holder at the centre. Two
 *  neighbours that `joined` names (an arrow between them in the row) keep one
 *  unit between them, room for the arrow and its receipt. The grid has two
 *  columns per unit, so a centred row starts on a whole column. */
export function mapCompactGrid(
  layout: MapLayout,
  shown: ReadonlySet<string>,
  joined: (a: string, b: string) => boolean = () => false,
): MapGrid {
  const byRow = new Map<number, MapNode[]>();
  for (const n of layout.nodes) {
    if (!shown.has(n.id)) continue;
    const xs = byRow.get(n.row) ?? [];
    xs.push(n);
    byRow.set(n.row, xs);
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b).map((r) => byRow.get(r)!.sort((a, b) => a.col - b.col));
  // The unit kept before each node of a row: one after a joined neighbour.
  const gapBefore = (xs: MapNode[], i: number) => (i > 0 && joined(xs[i - 1].id, xs[i].id) ? 1 : 0);
  // The width of nodes `from` to `to` (exclusive) of a row, their gaps between them.
  const width = (xs: MapNode[], from: number, to: number) => {
    let w = 0;
    for (let i = from; i < to; i++) w += xs[i].span + (i > from ? gapBefore(xs, i) : 0);
    return w;
  };
  // Each row's width in units, and where its first node starts.
  const placed = rows.map((xs) => {
    const h = xs.findIndex((n) => n.id === MAP_HOLDER);
    if (h === -1) return { xs, w: width(xs, 0, xs.length), lead: 0 };
    const left = h > 0 ? width(xs, 0, h) + gapBefore(xs, h) : 0;
    const right = h < xs.length - 1 ? width(xs, h + 1, xs.length) + gapBefore(xs, h + 1) : 0;
    const side = Math.max(left, right);
    return { xs, w: 2 * side + xs[h].span, lead: side - left };
  });
  const units = Math.max(1, ...placed.map((p) => p.w));
  const cells: Record<string, MapCell> = {};
  placed.forEach(({ xs, w, lead }, i) => {
    // In half units: (units - w) / 2 + lead, doubled.
    let at = units - w + 2 * lead + 1;
    for (const [j, n] of xs.entries()) {
      at += 2 * gapBefore(xs, j);
      cells[n.id] = { col: at, span: 2 * n.span, row: i + 1 };
      at += 2 * n.span;
    }
  });
  return { columns: 2 * units, rows: rows.length, cells, scale: units / layout.columns };
}

/** Whether a filled edge joins two nodes, either way. */
export function mapJoined(layout: MapLayout, fill: MapFill): (a: string, b: string) => boolean {
  const pairs = new Set<string>();
  for (const e of layout.edges)
    if (fill.edges[e.id]) {
      pairs.add(`${e.from}|${e.to}`);
      pairs.add(`${e.to}|${e.from}`);
    }
  return (a, b) => pairs.has(`${a}|${b}`);
}

/** The query param that draws the whole layout: `?routes=all`. */
export const MAP_ROUTES_PARAM = "routes";

export type MapRoutes = "used" | "all";

/** The routes a page's query asks for: "all" for `routes=all`, else "used". */
export function mapRoutesFromSearch(search: string): MapRoutes {
  return new URLSearchParams(search).get(MAP_ROUTES_PARAM) === "all" ? "all" : "used";
}

/** The url with the routes set: `routes=all`, or no param for "used". The
 *  other params and the hash are kept. */
export function mapRoutesHref(href: string, routes: MapRoutes): string {
  const url = new URL(href);
  if (routes === "all") url.searchParams.set(MAP_ROUTES_PARAM, "all");
  else url.searchParams.delete(MAP_ROUTES_PARAM);
  return url.href;
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
  return raw ? mapEdgesIn(raw.split(","), fill) : [];
}

/** The ids the fill has an edge for, once each, in their order: a filter's
 *  arrows, checked against the fill as it stands (older rows' edges included
 *  once merged). */
export function mapEdgesIn(ids: string[], fill: MapFill): string[] {
  const xs = ids.map((x) => x.trim());
  return xs.filter((id, i) => id !== "" && fill.edges[id] != null && xs.indexOf(id) === i);
}

/** Whether landing on an event must first clear the edge filter: the filter
 *  hides it. */
export const mapLandingClearsFilter = (eventId: string, hidden: ReadonlySet<string> | null): boolean =>
  hidden?.has(eventId) === true;

/** A plain primary click, which a page may handle in place; a modifier or
 *  another button keeps the link's behaviour (a new tab, a download). */
export const mapPlainClick = (ev: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean => ev.button === 0 && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey;

// ── The explanation drawer (ui-jobs 873.5) ─────────────────────────────────
// Under the legend, the map's plain-language account of the address: tabs of
// grouped bullets the protocol builds from its fill (Polaris:
// lib/polaris/peth-map-explanation.ts) and the shared map draws. A bullet is
// text and parts: each figure is a fill amount drawn bold with its receipt,
// each time a link to its event on the timeline.

/** One end of a time: its words, its event and where it links. `later`: the
 *  row was read after the page's first read, and the link opens the event's
 *  page, not the timeline. */
export interface MapWhenEnd {
  text: string;
  id: string;
  href: string;
  later?: true;
}

/** A time in the account, as the drawer prints it: "at T", or "from T1 to
 *  T2". Each end's text is set by the builder (the first time in the drawer
 *  carries its date, a later one on the same day the time alone), and links
 *  to its event on the timeline. Counts as one word and one figure. */
export interface MapWhen {
  from: MapWhenEnd;
  to?: MapWhenEnd;
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
  /** A link; `edges` where it opens the timeline filtered to those edges. */
  | { link: string; href: string; edges?: string[] };

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
