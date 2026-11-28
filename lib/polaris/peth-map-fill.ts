// One address's fill of the Polaris map (ui-jobs 873): the route's rows summed
// by place into the layout's edges, and each box's "in" and "now". Built on
// the Next server where the page data is built, so a heavy address sends a
// few dozen figures to the browser. Pure, and imports nothing through `@/`, so
// scripts/test/polaris-peth-map-fill.test.mjs loads it directly.
//
// A row's place is ui-jobs 872's `place` and `places` (the server's
// placesOf). The map reads them through one adapter, `pethMapPlaces`. On an
// answer that sends them, a row with no place that moved pETH to or from
// another address counts on the "Other addresses" box. An answer that sends
// none (`pethPlacesServed` false), a ledger still being read and one too
// heavy to list all set `edgesUnknown`: no arrows, and no box marked unused.
//
// Every figure carries a receipt (MapReceipt). An arrow and a box's "in" sum
// rows; a box's "now" is the same figure as the places section's and takes
// that section's receipt, from lib/polaris/peth-provenance.ts through the
// context (`receipts`).
//
// THE ETH ARROWS carry the row's ETH in and ETH out, the figures the card
// states: they count only zaps and trades into or out of pETH or fpETH. A row
// with several places gives its ETH to the curve, else the splitter, else the
// zap, else its first place. A zap to or from vpETH, USDp, GOLDp or POLAR
// draws its tokens and no ETH. Morpho Blue moves show their vpETH and are not
// decoded. The fee router's rewards
// back to the address are not read yet (ui-jobs 871), and the box says so.

import type { PethLedgerLine, PethLedgerRow, PethPlace, PolarisPethResponse } from "../sources/api/polaris-peth";
import type { MapAmount, MapFill, MapLine, MapReceipt } from "../shared/protocol-map/types";
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
  /** The icon's key; absent for native ETH, which the icon finds by symbol. */
  address?: string;
}

/** The deployment's names the fill needs, from lib/polaris/asset-catalog.ts. */
export interface PethMapContext {
  chain: string;
  peth: PethMapToken & { address: string };
  fpeth: PethMapToken & { address: string };
  vpeth: PethMapToken & { address: string };
  svpeth: PethMapToken & { address: string };
  weth: PethMapToken & { address: string };
  /** USDp, GOLDp and POLAR by lower-cased address: a zap's other side. */
  others: Record<string, PethMapToken>;
  /** Each market's stablecoin symbol, for a CDP or a deposit's name. */
  marketSymbol: Record<string, string>;
  /** Each venue's name, by its deployment column. */
  venueLabel: Record<string, string>;
  /** The address's timeline filtered to one edge. */
  timelineHref: (edgeId: string) => string;
  /** The places section's receipts, for the figures both sections show. */
  receipts: PethMapReceipts;
}

/** The places section's receipt for each figure the map's boxes repeat
 *  (lib/polaris/peth-provenance.ts). `stored`: the chain did not answer and
 *  the figure is the stored index's. */
export interface PethMapReceipts {
  held: (what: "peth" | "fpeth" | "vpeth" | "svpeth" | "svpethVpeth", block: string | null) => MapReceipt;
  cdpTotal: (stored: boolean, block: string | null) => MapReceipt;
  cdp: (market: "usdp" | "goldp", id: string, block: string, tx: string) => MapReceipt;
  spTotal: (stored: boolean, block: string | null) => MapReceipt;
  sp: (market: "usdp" | "goldp", id: string, block: string, tx: string) => MapReceipt;
  loanTotal: (stored: boolean, block: string | null) => MapReceipt;
  loan: (id: string) => MapReceipt;
  lpTotal: (block: string | null) => MapReceipt;
  lp: (venue: string, block: string | null) => MapReceipt;
}

const NATIVE_ETH: PethMapToken = { symbol: "ETH" };
const VIA = "GET /api/polaris/peth/<address>";

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
    const k = (t.address ?? "").toLowerCase() + t.symbol;
    const hit = this.m.get(k);
    if (hit) hit.sum += raw;
    else this.m.set(k, { ...amount(t, ZERO), sum: raw });
  }
  amounts(): MapAmount[] {
    return [...this.m.values()].map(({ sum, ...a }) => ({ ...a, raw: sum.toString() }));
  }
}

const amount = (t: PethMapToken, raw: bigint): MapAmount => ({
  asset: t.symbol,
  ...(t.address ? { address: t.address } : {}),
  raw: raw.toString(),
  decimals: 18,
});

type Flow = { edgeId: string; place: string; token?: PethMapToken; raw?: bigint };

/** The group a row's ETH in and ETH out go to: the curve, else the splitter,
 *  else the zap, else the first. */
const ETH_ORDER = ["curve", "splitter", "zap"];
function ethGroup(groups: PethMapPlaceLines[]): number {
  for (const k of ETH_ORDER) {
    const i = groups.findIndex((g) => g.kind === k);
    if (i >= 0) return i;
  }
  return groups.findIndex((g) => PM_NODE_OF_PLACE[g.kind] != null);
}

/** The edges one row adds to, with what it adds. */
function rowFlows(row: PethLedgerRow, ctx: PethMapContext): Flow[] {
  const out: Flow[] = [];
  const lc = (a: string) => a.toLowerCase();
  const ethLike = (a: string) => NATIVE.includes(lc(a)) || lc(a) === lc(ctx.weth.address);
  const ethToken = (a: string | undefined): PethMapToken => (a && NATIVE.includes(lc(a)) ? NATIVE_ETH : ctx.weth);
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
  const groups = pethMapPlaces(row);
  const ethAt = ethGroup(groups);
  let feeDone = false;
  groups.forEach((g, gi) => {
    const node = PM_NODE_OF_PLACE[g.kind];
    if (!node) return;
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
    const z = row.zap;
    if (gi === ethAt) {
      if (zap) {
        if (ethIn > ZERO)
          out.push({ edgeId: pmEdge(PM.eth, PM.zap), place: "zap", token: ethToken(z?.token_in), raw: ethIn });
        if (ethOut > ZERO)
          out.push({ edgeId: pmEdge(PM.zap, PM.eth), place: "zap", token: ethToken(z?.token_out), raw: ethOut });
      } else {
        if (ethIn > ZERO) out.push({ edgeId: pmEdge(MAP_HOLDER, node), place: g.kind, token: ctx.weth, raw: ethIn });
        if (ethOut > ZERO) out.push({ edgeId: pmEdge(node, MAP_HOLDER), place: g.kind, token: ctx.weth, raw: ethOut });
      }
    }
    if (zap && z) {
      const tin = ctx.others[lc(z.token_in)];
      const tout = ctx.others[lc(z.token_out)];
      if (tin) out.push({ edgeId: pmEdge(PM.other, PM.zap), place: "zap", token: tin, raw: big(z.amount_in) });
      if (tout) out.push({ edgeId: pmEdge(PM.zap, PM.other), place: "zap", token: tout, raw: big(z.amount_out) });
    }
    if (fee > ZERO && !feeDone && (g.kind === "curve" || (zap && !groups.some((x) => x.kind === "curve")))) {
      if (zap) out.push({ edgeId: pmEdge(PM.zap, PM.curve), place: "zap" });
      out.push({ edgeId: pmEdge(PM.curve, PM.fee), place: g.kind, token: ctx.peth, raw: fee });
      feeDone = true;
    }
  });
  return out;
}

const EDGES = new Map(POLARIS_MAP_LAYOUT.edges.map((e) => [e.id, e]));
const TITLE = new Map(POLARIS_MAP_LAYOUT.nodes.map((n) => [n.id, n.title]));

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

/** Each mechanism box with several places of one kind, in words for a count
 *  that may visit two of them in one row. */
const PLACES_WORD: Record<string, string> = {
  [PM.cdp]: "CDPs",
  [PM.sp]: "deposits",
  [PM.loan]: "loans",
  [PM.pools]: "pools",
};

const plural = (n: number, one: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : `${one}s`}`;

export function buildPethMapFill(d: PolarisPethResponse, ctx: PethMapContext): MapFill {
  const ok = (d.status == null || d.status === "ok") && d.ledger?.complete !== false;
  const served = pethPlacesServed(d);
  // Without the ledger, or without places served, the rows say nothing about
  // the arrows: sum none, and mark no box unused.
  const known = ok && served;
  const rows = ok ? (d.rows ?? []) : [];
  const ledgerBlock = d.ledger?.scanned_to_block ?? d.scanned_to_block ?? null;
  const headBlock = d.head?.block ?? null;
  const sums = new Map<string, { s: Sums; rows: number }>();
  const fillRows: MapFill["rows"] = [];
  // The rows at each box, once per row.
  const boxRows = new Map<string, number>();
  for (const r of rows) {
    const used = new Set<string>();
    if (known) {
      for (const f of rowFlows(r, ctx)) {
        if (!EDGES.get(f.edgeId)?.places.includes(f.place)) continue;
        const e = sums.get(f.edgeId) ?? { s: new Sums(), rows: 0 };
        if (f.token && f.raw != null) e.s.add(f.token, f.raw);
        if (!used.has(f.edgeId)) e.rows++;
        used.add(f.edgeId);
        sums.set(f.edgeId, e);
      }
      const boxes = new Set(
        pethMapPlaces(r)
          .map((g) => PM_NODE_OF_PLACE[g.kind])
          .filter(Boolean),
      );
      for (const b of boxes) boxRows.set(b, (boxRows.get(b) ?? 0) + 1);
    }
    fillRows.push({ id: r.tx_hash.toLowerCase(), edgeIds: [...used] });
  }

  // With more rows than the page read, an arrow states the rows read on it
  // and no amount, and each box what 872's place_counts gives for it.
  const total = ok ? (d.total_rows ?? rows.length) : 0;
  const full = rows.length >= total;
  const sumReceipt = (name: string, n: number, what: string): MapReceipt => ({
    summary: `${name} — the amounts ${what}, summed over ${plural(n, "transaction")}.`,
    kind: "chain-derived",
    pclass: "indexed",
    via: `${VIA} · rows`,
    formula: "Σ amount over this arrow's transactions",
    rows: n,
    ...(ledgerBlock ? { source: { block: ledgerBlock } } : {}),
  });
  const edges: MapFill["edges"] = {};
  for (const e of POLARIS_MAP_LAYOUT.edges) {
    const s = sums.get(e.id);
    if (!s) continue;
    const name = `${TITLE.get(e.from)} → ${TITLE.get(e.to)}`;
    edges[e.id] = {
      amounts: full ? s.s.amounts() : [],
      rowCount: s.rows,
      timelineHref: ctx.timelineHref(e.id),
      receipt: sumReceipt(name, s.rows, "this address moved along this arrow"),
    };
  }

  // Each box's count over the whole ledger where the page did not read every
  // row: place_counts counts a row once per place, so a box with several
  // places states visits.
  const placeTally = new Map<string, { rows: number; places: number }>();
  for (const c of (ok ? d.place_counts : null) ?? []) {
    const node = PM_NODE_OF_PLACE[c.place.kind];
    if (!node) continue;
    const t = placeTally.get(node) ?? { rows: 0, places: 0 };
    placeTally.set(node, { rows: t.rows + c.rows, places: t.places + 1 });
  }
  const boxCount = (id: string): { rowCount?: number; line?: MapLine } => {
    if (!known) return {};
    if (full) {
      const n = boxRows.get(id);
      return n ? { rowCount: n } : {};
    }
    const t = placeTally.get(id);
    if (!t) return {};
    const text =
      t.places > 1 && PLACES_WORD[id]
        ? `${plural(t.rows, "visit")} across its ${t.places.toLocaleString("en-US")} ${PLACES_WORD[id]}`
        : `${plural(t.rows, "transaction")} in all`;
    return { rowCount: t.rows, line: { label: "note", amounts: [], text } };
  };

  const nodes: MapFill["nodes"] = {};
  const put = (id: string, lines: (MapLine | null)[]) => {
    const c = boxCount(id);
    const ls = [...lines, c.line ?? null].filter(
      (l): l is MapLine => l != null && (l.amounts.length > 0 || l.text != null),
    );
    if (ls.length > 0 || c.rowCount != null)
      nodes[id] = { lines: ls, ...(c.rowCount != null ? { rowCount: c.rowCount } : {}) };
  };
  const inLine = (node: string): MapLine | null => {
    const e = edges[pmEdge(MAP_HOLDER, node)];
    return e && e.amounts.length > 0
      ? {
          label: "in",
          amounts: e.amounts,
          receipt: sumReceipt(`${TITLE.get(node)}, in`, e.rowCount, "this address put into it"),
        }
      : null;
  };
  const rc = ctx.receipts;
  const stored = d.ledger != null && d.ledger.complete === null;
  const latest = (blocks: string[]): string | null =>
    blocks.reduce<string | null>((b, x) => (b == null || BigInt(x) > BigInt(b) ? x : b), null);
  const r = d.rollup;

  // The address: what it holds now, each token with its balance's receipt.
  const heldAmounts = (
    [
      [ctx.peth, r.wallet_peth.raw, "peth", r.wallet_peth.block],
      [ctx.fpeth, r.wallet_fpeth.raw, "fpeth", r.wallet_fpeth.block],
      [ctx.vpeth, r.wallet_vpeth.raw, "vpeth", r.wallet_vpeth.block],
      [ctx.svpeth, r.wallet_svpeth?.raw, "svpeth", r.wallet_svpeth?.block],
    ] as const
  )
    .filter(([, raw]) => big(raw) > ZERO)
    .map(([t, raw, what, block]) => ({ ...amount(t, big(raw)), receipt: rc.held(what, block ?? headBlock) }));
  put(MAP_HOLDER, [
    r.wallet_peth.raw == null
      ? { label: "note", amounts: [], text: "Holdings not read" }
      : { label: "now", amounts: heldAmounts },
  ]);

  const cdps = r.cdp_collateral.items ?? [];
  const cdpBlock = latest(cdps.map((c) => c.as_of_block));
  put(PM.cdp, [
    inLine(PM.cdp),
    cdps.length > 0 && r.cdp_collateral.raw != null
      ? {
          label: "now",
          amounts: [amount(ctx.peth, big(r.cdp_collateral.raw))],
          receipt: rc.cdpTotal(stored, cdpBlock),
        }
      : null,
    ...cdps.map((c) => {
      const text = `${ctx.marketSymbol[c.market] ?? c.market} CDP #${c.cdp_id}`;
      return {
        label: "note" as const,
        text,
        amounts: [amount(ctx.peth, big(c.coll_raw))],
        receipt: rc.cdp(c.market, c.cdp_id, c.as_of_block, c.as_of_tx),
      };
    }),
    cdps.length > 0 ? { label: "note", amounts: [], text: "At each CDP's last touch" } : null,
  ]);

  const sps = r.sp_peth.items ?? [];
  put(PM.sp, [
    inLine(PM.sp),
    sps.length > 0 && r.sp_peth.raw != null
      ? {
          label: "now",
          amounts: [amount(ctx.peth, big(r.sp_peth.raw))],
          receipt: rc.spTotal(stored, latest(sps.map((x) => x.as_of_block))),
        }
      : null,
    ...sps.map((s) => {
      const text = `${ctx.marketSymbol[s.market] ?? s.market} deposit #${s.token_id}`;
      return {
        label: "note" as const,
        text,
        amounts: [amount(ctx.peth, big(s.peth_raw))],
        receipt: rc.sp(s.market, s.token_id, s.as_of_block, s.as_of_tx),
      };
    }),
  ]);

  const loans = r.loans_fpeth.items ?? [];
  put(PM.loan, [
    inLine(PM.loan),
    loans.length > 0 && r.loans_fpeth.raw != null
      ? {
          label: "now",
          amounts: [amount(ctx.fpeth, big(r.loans_fpeth.raw))],
          receipt: rc.loanTotal(stored, null),
        }
      : null,
    ...loans.map((l) => {
      const text = `Reserve loan #${l.loan_id}`;
      return {
        label: "note" as const,
        text,
        amounts: [amount(ctx.fpeth, big(l.fpeth_raw))],
        receipt: rc.loan(l.loan_id),
      };
    }),
  ]);

  const lps = r.lp.filter((x) => big(x.lp_balance_raw) > ZERO);
  const share = lps.reduce((s, x) => s + big(x.peth_share_raw), ZERO);
  put(PM.pools, [
    inLine(PM.pools),
    lps.length > 0
      ? {
          label: "now",
          amounts: [amount(ctx.peth, share)],
          receipt: rc.lpTotal(lps[0].block ?? headBlock),
        }
      : null,
    ...(lps.length > 1
      ? lps.map((x) => {
          const text = ctx.venueLabel[x.venue] ?? x.venue;
          return {
            label: "note" as const,
            text,
            amounts: [amount(ctx.peth, big(x.peth_share_raw))],
            receipt: rc.lp(x.venue, x.block ?? headBlock),
          };
        })
      : []),
  ]);

  const sv = r.wallet_svpeth;
  put(PM.svpeth, [
    inLine(PM.svpeth),
    sv?.raw != null && big(sv.raw) > ZERO
      ? {
          label: "now",
          amounts: [amount(ctx.svpeth, big(sv.raw))],
          receipt: rc.held("svpeth", sv.block ?? headBlock),
        }
      : null,
    sv?.vpeth_raw != null && big(sv.vpeth_raw) > ZERO
      ? {
          label: "note",
          text: "Converts to",
          amounts: [amount(ctx.vpeth, big(sv.vpeth_raw))],
          receipt: rc.held("svpethVpeth", sv.block ?? headBlock),
        }
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
      asOf: { block: headBlock ?? ledgerBlock, time: d.ledger?.scanned_to_timestamp ?? null },
    },
    nodes,
    edges,
    rows: fillRows,
    counted: { rows: rows.length, total },
    ...(known ? {} : { edgesUnknown: true as const }),
  };
}
