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
// gain. Pure, and imports nothing: scripts/test loads it directly.

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
  address?: string;
  raw: string;
  decimals: number;
}

export interface MapLine {
  label: "in" | "now" | "note";
  amounts: MapAmount[];
  /** Words before the amounts (a note's sentence, an item's name). */
  text?: string;
}

export interface MapEdgeFill {
  amounts: MapAmount[];
  rowCount: number;
  timelineHref: string;
}

export interface MapFill {
  subject: { address: string; chain: string; asOf: { block: string | null; time: string | null } };
  /** Each box's lines, and the rows at it over the whole history where the
   *  fill could not sum every row. */
  nodes: Record<string, { lines: MapLine[]; rowCount?: number }>;
  edges: Record<string, MapEdgeFill>;
  /** The rows the fill summed, each naming its edges. */
  rows: { id: string; edgeIds: string[] }[];
  /** How many rows the fill summed, of how many the address has. */
  counted: { rows: number; total: number };
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

/** The query param that filters an address's timeline to one edge. */
export const MAP_EDGE_PARAM = "map";
