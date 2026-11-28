// One address's fill of the Polaris map (ui-jobs 873): the route's rows summed
// by place into the layout's edges, and each box's "in" and "now". Built on
// the Next server where the page data is built, so a heavy address sends a
// few dozen figures to the browser. Pure, and imports nothing through `@/`, so
// scripts/test/polaris-peth-map-fill.test.mjs loads it directly.
//
// A row's place is ui-jobs 872's `place` (the server's placeOf). The map reads
// it through one adapter, `pethMapPlaces`, which takes a row-level `places`
// list, a single `place`, or a `place` on each line, whichever 872 sends. A
// row with no place that moved pETH to or from another address counts on the
// "Other addresses" box.
//
// THE ETH ARROWS carry the row's ETH in and ETH out, the figures the card
// states: they count only zaps and trades into or out of pETH or fpETH. A zap
// to or from vpETH, USDp, GOLDp or POLAR draws its tokens and no ETH. Morpho
// Blue moves show their vpETH and are not decoded. The fee router's rewards
// back to the address are not read yet (ui-jobs 871), and the box says so.

import type { PethLedgerLine, PethLedgerRow, PethPlace, PolarisPethResponse } from "../sources/api/polaris-peth";
import type { MapAmount, MapFill, MapLine } from "../shared/protocol-map/types";
import { MAP_HOLDER } from "../shared/protocol-map/types";
import { PM, PM_NODE_OF_PLACE, POLARIS_MAP_LAYOUT, pmEdge } from "./peth-map-layout";

const ZERO = BigInt(0);
const big = (raw: string | null | undefined): bigint => {
  if (raw == null || raw === "") return ZERO;
  const i = raw.indexOf(".");
  return BigInt(i < 0 ? raw : raw.slice(0, i) || "0");
};

export interface PethMapToken {
  symbol: string;
  address: string;
}

/** The deployment's names the fill needs, from lib/polaris/asset-catalog.ts. */
export interface PethMapContext {
  chain: string;
  peth: PethMapToken;
  fpeth: PethMapToken;
  vpeth: PethMapToken;
  svpeth: PethMapToken;
  weth: PethMapToken;
  /** USDp, GOLDp and POLAR by lower-cased address: a zap's other side. */
  others: Record<string, PethMapToken>;
  /** Each market's stablecoin symbol, for a CDP or a deposit's name. */
  marketSymbol: Record<string, string>;
  /** Each venue's name, by its deployment column. */
  venueLabel: Record<string, string>;
  /** The address's timeline filtered to one edge. */
  timelineHref: (edgeId: string) => string;
}

/** Kinds with no single place (872) that moved pETH to or from another address. */
const TRANSFER_KINDS = new Set([
  "wallet_receive",
  "wallet_send",
  "contract_receive",
  "contract_send",
  "transfer_in",
  "transfer_out",
]);

const NATIVE = ["0x0000000000000000000000000000000000000000", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"];

export interface PethMapPlaceLines {
  /** The place kind, or "transfer" for a row with none that moved pETH
   *  to or from another address. */
  kind: string;
  place: PethPlace | null;
  lines: PethLedgerLine[];
}

/** The ADAPTER: a row's places, each with the lines that touched it. Reads
 *  the row's `places` (872), else its single `place`. With several places, a
 *  line goes to the place whose contract is its counterparty, a zap router's
 *  line to the zap, and any other (a pool share minted from the zero
 *  address) to the first place that is not the zap. */
export function pethMapPlaces(row: PethLedgerRow): PethMapPlaceLines[] {
  const ps = row.places && row.places.length > 0 ? row.places : row.place ? [row.place] : [];
  if (ps.length === 0) return TRANSFER_KINDS.has(row.kind) ? [{ kind: "transfer", place: null, lines: row.lines }] : [];
  if (ps.length === 1) return [{ kind: ps[0].kind, place: ps[0], lines: row.lines }];
  const groups = ps.map((p) => ({ kind: p.kind, place: p, lines: [] as PethLedgerLine[] }));
  for (const l of row.lines) {
    const cp = l.counterparty.toLowerCase();
    const g =
      groups.find((x) => x.place.address != null && x.place.address.toLowerCase() === cp) ??
      (l.counterparty_role === "zap_router" ? groups.find((x) => x.kind === "zap") : undefined) ??
      groups.find((x) => x.kind !== "zap") ??
      groups[0];
    g.lines.push(l);
  }
  return groups;
}

class Sums {
  private m = new Map<string, MapAmount & { sum: bigint }>();
  add(t: PethMapToken, raw: bigint) {
    if (raw <= ZERO) return;
    const k = t.address.toLowerCase() + t.symbol;
    const hit = this.m.get(k);
    if (hit) hit.sum += raw;
    else this.m.set(k, { asset: t.symbol, address: t.address, raw: "0", decimals: 18, sum: raw });
  }
  get empty() {
    return this.m.size === 0;
  }
  amounts(): MapAmount[] {
    return [...this.m.values()].map(({ sum, ...a }) => ({ ...a, raw: sum.toString() }));
  }
}

const amount = (t: PethMapToken, raw: bigint): MapAmount => ({
  asset: t.symbol,
  address: t.address,
  raw: raw.toString(),
  decimals: 18,
});

/** The edges one row adds to, with what it adds. */
function rowFlows(
  row: PethLedgerRow,
  ctx: PethMapContext,
): { edgeId: string; place: string; token?: PethMapToken; raw?: bigint }[] {
  const out: { edgeId: string; place: string; token?: PethMapToken; raw?: bigint }[] = [];
  const lc = (a: string) => a.toLowerCase();
  const ethLike = (a: string) => NATIVE.includes(lc(a)) || lc(a) === lc(ctx.weth.address);
  const ethToken = (a: string | undefined): PethMapToken =>
    a && NATIVE.includes(lc(a)) ? { symbol: "ETH", address: ctx.weth.address } : ctx.weth;
  const tokenOf = (t: string): PethMapToken | null => {
    if (t === "peth" || t === "fpeth" || t === "vpeth") return ctx[t];
    if (t.startsWith("lp_")) return null;
    const a = lc(t);
    for (const k of ["peth", "fpeth", "vpeth", "svpeth"] as const) if (a === lc(ctx[k].address)) return ctx[k];
    if (ethLike(a)) return ethToken(a);
    return ctx.others[a] ?? null;
  };
  const ethIn = big(row.eth_in_raw);
  const ethOut = big(row.eth_out_raw);
  const fee = big(row.curve_fee_raw);
  let ethDone = false;
  let feeDone = false;
  for (const g of pethMapPlaces(row)) {
    const node = PM_NODE_OF_PLACE[g.kind];
    if (!node) continue;
    const zap = g.kind === "zap";
    for (const l of g.lines) {
      const raw = big(l.amount_raw);
      if (raw <= ZERO || l.rule === "liquidated") continue;
      // A zap's ETH side is the row's ETH in and ETH out, below.
      if (zap && ethLike(l.token)) continue;
      const t = tokenOf(l.token);
      if (!t) continue;
      out.push({
        edgeId: l.direction === "out" ? pmEdge(MAP_HOLDER, node) : pmEdge(node, MAP_HOLDER),
        place: g.kind,
        token: t,
        raw,
      });
    }
    if (zap) {
      const z = row.zap;
      if (!ethDone && ethIn > ZERO)
        out.push({ edgeId: pmEdge(PM.eth, PM.zap), place: "zap", token: ethToken(z?.token_in), raw: ethIn });
      if (!ethDone && ethOut > ZERO)
        out.push({ edgeId: pmEdge(PM.zap, PM.eth), place: "zap", token: ethToken(z?.token_out), raw: ethOut });
      ethDone = true;
      if (z) {
        const tin = ctx.others[lc(z.token_in)];
        const tout = ctx.others[lc(z.token_out)];
        if (tin) out.push({ edgeId: pmEdge(PM.other, PM.zap), place: "zap", token: tin, raw: big(z.amount_in) });
        if (tout) out.push({ edgeId: pmEdge(PM.zap, PM.other), place: "zap", token: tout, raw: big(z.amount_out) });
      }
      if (fee > ZERO && !feeDone) {
        out.push({ edgeId: pmEdge(PM.zap, PM.curve), place: "zap" });
        out.push({ edgeId: pmEdge(PM.curve, PM.fee), place: "zap", token: ctx.peth, raw: fee });
        feeDone = true;
      }
    } else {
      if (!ethDone && ethIn > ZERO)
        out.push({ edgeId: pmEdge(MAP_HOLDER, node), place: g.kind, token: ctx.weth, raw: ethIn });
      if (!ethDone && ethOut > ZERO)
        out.push({ edgeId: pmEdge(node, MAP_HOLDER), place: g.kind, token: ctx.weth, raw: ethOut });
      ethDone = ethDone || ethIn > ZERO || ethOut > ZERO;
      if (g.kind === "curve" && fee > ZERO && !feeDone) {
        out.push({ edgeId: pmEdge(PM.curve, PM.fee), place: "curve", token: ctx.peth, raw: fee });
        feeDone = true;
      }
    }
  }
  return out;
}

const EDGES = new Map(POLARIS_MAP_LAYOUT.edges.map((e) => [e.id, e]));

/** The edges a row used: the map's highlight for a timeline row. */
export function pethMapRowEdges(row: PethLedgerRow, ctx: PethMapContext): string[] {
  const ids = new Set<string>();
  for (const f of rowFlows(row, ctx)) if (EDGES.get(f.edgeId)?.places.includes(f.place)) ids.add(f.edgeId);
  return [...ids];
}

/** Whether the server sends each row's place (ui-jobs 872): `place_counts`
 *  is present, or a row carries a `place` or `places` key. A served row with
 *  `place: null` is a plain transfer; an answer with neither key on any row
 *  says nothing about where its rows went. */
export const pethPlacesServed = (d: Pick<PolarisPethResponse, "place_counts" | "rows">): boolean =>
  d.place_counts !== undefined || (d.rows ?? []).some((r) => "place" in r || "places" in r);

export function buildPethMapFill(d: PolarisPethResponse, ctx: PethMapContext): MapFill {
  const ok = (d.status == null || d.status === "ok") && d.ledger?.complete !== false;
  const served = pethPlacesServed(d);
  // Without places served, every row would read as a transfer: sum none.
  const rows = ok ? (d.rows ?? []) : [];
  const summed = served ? rows : [];
  const sums = new Map<string, { s: Sums; rows: number }>();
  const fillRows: MapFill["rows"] = [];
  if (!served) for (const r of rows) fillRows.push({ id: r.tx_hash.toLowerCase(), edgeIds: [] });
  for (const r of summed) {
    const used = new Set<string>();
    for (const f of rowFlows(r, ctx)) {
      if (!EDGES.get(f.edgeId)?.places.includes(f.place)) continue;
      const e = sums.get(f.edgeId) ?? { s: new Sums(), rows: 0 };
      if (f.token && f.raw != null) e.s.add(f.token, f.raw);
      if (!used.has(f.edgeId)) e.rows++;
      used.add(f.edgeId);
      sums.set(f.edgeId, e);
    }
    fillRows.push({ id: r.tx_hash.toLowerCase(), edgeIds: [...used] });
  }

  // With more rows than the page read, an arrow states the rows read on it
  // and no amount, and each box the rows at its places over the whole ledger
  // (872's place_counts).
  const total = ok ? (d.total_rows ?? rows.length) : 0;
  const full = rows.length >= total;
  const edges: MapFill["edges"] = {};
  for (const e of POLARIS_MAP_LAYOUT.edges) {
    const s = sums.get(e.id);
    if (s) edges[e.id] = { amounts: full ? s.s.amounts() : [], rowCount: s.rows, timelineHref: ctx.timelineHref(e.id) };
  }
  const placeRows = new Map<string, number>();
  for (const c of (ok ? d.place_counts : null) ?? []) {
    const node = PM_NODE_OF_PLACE[c.place.kind];
    if (node) placeRows.set(node, (placeRows.get(node) ?? 0) + c.rows);
  }
  const intoBox = (node: string) => edges[pmEdge(MAP_HOLDER, node)]?.amounts ?? [];

  const nodes: MapFill["nodes"] = {};
  const put = (id: string, lines: (MapLine | null)[]) => {
    const n = placeRows.get(id);
    const all: MapLine | null =
      n != null && !full
        ? {
            label: "note",
            amounts: [],
            text: `${n.toLocaleString("en-US")} ${n === 1 ? "transaction" : "transactions"} in all`,
          }
        : null;
    const ls = [...lines, all].filter((l): l is MapLine => l != null && (l.amounts.length > 0 || l.text != null));
    if (ls.length > 0 || n != null) nodes[id] = { lines: ls, ...(n != null ? { rowCount: n } : {}) };
  };
  const inLine = (node: string): MapLine | null => {
    const a = intoBox(node);
    return a.length > 0 ? { label: "in", amounts: a } : null;
  };
  const nowOf = (t: PethMapToken, raw: string | null | undefined): MapLine | null =>
    raw == null ? null : { label: "now", amounts: [amount(t, big(raw))] };
  const r = d.rollup;

  // The address: what it holds now.
  const held = new Sums();
  held.add(ctx.peth, big(r.wallet_peth.raw));
  held.add(ctx.fpeth, big(r.wallet_fpeth.raw));
  held.add(ctx.vpeth, big(r.wallet_vpeth.raw));
  held.add(ctx.svpeth, big(r.wallet_svpeth?.raw));
  put(MAP_HOLDER, [
    r.wallet_peth.raw == null
      ? { label: "note", amounts: [], text: "Holdings not read" }
      : { label: "now", amounts: held.amounts() },
  ]);

  const cdps = r.cdp_collateral.items ?? [];
  put(PM.cdp, [
    inLine(PM.cdp),
    cdps.length > 0 ? nowOf(ctx.peth, r.cdp_collateral.raw) : null,
    ...cdps.map((c) => ({
      label: "note" as const,
      text: `${ctx.marketSymbol[c.market] ?? c.market} CDP #${c.cdp_id}`,
      amounts: [amount(ctx.peth, big(c.coll_raw))],
    })),
    cdps.length > 0 ? { label: "note", amounts: [], text: "At each CDP's last touch" } : null,
  ]);

  const sps = r.sp_peth.items ?? [];
  put(PM.sp, [
    inLine(PM.sp),
    sps.length > 0 ? nowOf(ctx.peth, r.sp_peth.raw) : null,
    ...sps.map((s) => ({
      label: "note" as const,
      text: `${ctx.marketSymbol[s.market] ?? s.market} deposit #${s.token_id}`,
      amounts: [amount(ctx.peth, big(s.peth_raw))],
    })),
  ]);

  const loans = r.loans_fpeth.items ?? [];
  put(PM.loan, [
    inLine(PM.loan),
    loans.length > 0 ? nowOf(ctx.fpeth, r.loans_fpeth.raw) : null,
    ...loans.map((l) => ({
      label: "note" as const,
      text: `Reserve loan #${l.loan_id}`,
      amounts: [amount(ctx.fpeth, big(l.fpeth_raw))],
    })),
  ]);

  const lps = r.lp.filter((x) => big(x.lp_balance_raw) > ZERO);
  const share = lps.reduce((s, x) => s + big(x.peth_share_raw), ZERO);
  put(PM.pools, [
    inLine(PM.pools),
    lps.length > 0 ? { label: "now", amounts: [amount(ctx.peth, share)] } : null,
    ...(lps.length > 1
      ? lps.map((x) => ({
          label: "note" as const,
          text: ctx.venueLabel[x.venue] ?? x.venue,
          amounts: [amount(ctx.peth, big(x.peth_share_raw))],
        }))
      : []),
  ]);

  const sv = r.wallet_svpeth;
  put(PM.svpeth, [
    inLine(PM.svpeth),
    sv?.raw != null && big(sv.raw) > ZERO ? nowOf(ctx.svpeth, sv.raw) : null,
    sv?.vpeth_raw != null && big(sv.vpeth_raw) > ZERO
      ? { label: "note", text: "Converts to", amounts: [amount(ctx.vpeth, big(sv.vpeth_raw))] }
      : null,
  ]);

  put(PM.zap, []);
  put(PM.curve, []);
  put(PM.outside, []);
  put(PM.splitter, [inLine(PM.splitter)]);
  put(PM.morpho, [inLine(PM.morpho)]);
  put(PM.fee, [{ label: "note", amounts: [], text: "Rewards back to this address: not read yet" }]);

  return {
    subject: {
      address: d.address,
      chain: ctx.chain,
      asOf: {
        block: d.head?.block ?? d.ledger?.scanned_to_block ?? null,
        time: d.ledger?.scanned_to_timestamp ?? null,
      },
    },
    nodes,
    edges,
    rows: fillRows,
    counted: { rows: rows.length, total },
    ...(served ? {} : { edgesUnknown: true as const }),
  };
}
