// The Compound V2 proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's own query and a hop to the box, and answers what the route answers.
// SERVER-ONLY.

import { COMPOUND_V2_KEYS_BY_SYMBOL, COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { buildCompoundV2PositionRows, type RawCompoundV2WalletRow } from "@/lib/sources/api/compound-v2-positions";
import { buildCompoundV2Timeline, type CompoundV2MvRow } from "@/lib/sources/api/compound-v2-timeline";
import { compoundV2ServedFolder } from "@/lib/sources/api/compound-folder-wire";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

// The filter chips are underlying SYMBOLS; the rails route filters by market
// KEY. One symbol can name SEVERAL markets — WBTC is two (wbtc, wbtc2) — so
// the map is one-to-many and every matching key is sent. Raw keys pass
// through untouched.
function symbolsToMarketKeys(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .flatMap((s) => COMPOUND_V2_KEYS_BY_SYMBOL[s] ?? [s.toLowerCase()])
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawCompoundV2WalletRow[];
  total: number;
  limit: number;
  offset: number;
}

/** `/api/compound-v2/positions`: the { success, data, pagination } envelope. */
export async function readCompoundV2Positions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("hasDebt")) qs.set("hasDebt", sp.get("hasDebt")!);
  if (sp.get("noDebt")) qs.set("noDebt", sp.get("noDebt")!);
  if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
  if (sp.get("supplyAssets")) qs.set("supplyMarkets", symbolsToMarketKeys(sp.get("supplyAssets")!));
  if (sp.get("borrowAssets")) qs.set("borrowMarkets", symbolsToMarketKeys(sp.get("borrowAssets")!));
  // Allowlist, like sortOrder: an unrecognised value is dropped rather than
  // forwarded verbatim, so rails-server's own default (recent) decides it —
  // same "unrecognised ⇒ default, no error" stance the route takes throughout.
  const sortBy = sp.get("sortBy");
  if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/compound-v2/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = await buildCompoundV2PositionRows(raw.rows);
  return proxyOk(
    { success: true, data, pagination: { total: raw.total, limit: raw.limit, offset: raw.offset } },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** The backend's max page size. */
const PAGE_LIMIT = 5000;
/** Hard stop on the cursor walk — 20 × 5000 = 100k events dwarfs the deepest
 *  wallet on the roster; if it ever trips, events.length < totalEvents states
 *  the truncation plainly rather than looping without bound. */
const MAX_PAGES = 20;

interface TimelineRowsResponse {
  wallet: string;
  rows: CompoundV2MvRow[];
  totalEvents: number;
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  /** Where `?recent=N` drew the line — see the fetch loop below. Null (or
   *  absent, on a backend that predates it) means the pages ARE the whole
   *  history. */
  cutoffBlock?: number | null;
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
  span?: { from: number; to: number } | null;
}

/** `/api/compound-v2/timeline`: the wire timeline, flat or `?group=1`. The
 *  route's header comment carries the argument for both shapes. */
export async function readCompoundV2Timeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Sent on the FIRST page
  // only — the window and the cursor compose upstream, and page one's cursor
  // already sits at or past the cutoff, so re-sending it would let a fresh
  // event move a recomputed cutoff up mid-drain.
  const recent = sp.get("recent");
  const from = sp.get("from");
  const to = sp.get("to");

  if (sp.get("group") === "1") {
    const qs = new URLSearchParams({ wallet, group: "1" });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const response = await fetch(`${hop.baseUrl}/api/compound-v2/timeline?${qs.toString()}`, {
      headers: hop.headers,
    });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<CompoundV2MvRow>;
    // A backend that predates the grouping answers the flat, paged shape;
    // reading it as rows would draw a page of folders that are not folders.
    if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
      return proxyFail(502, {
        error: "Not grouped",
        code: "GROUPING_UNAVAILABLE",
        message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
      });
    }
    const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
    const data = buildCompoundV2Timeline(eventRows, wallet, upstream.totalEvents);
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: compoundV2ServedFolder(r.folder) },
    );
    const body = {
      ...data,
      totalEvents: upstream.totalEvents,
      cutoffBlock: upstream.cutoffBlock ?? null,
      grouped: true as const,
      rowPlan,
      eventsServed: upstream.eventsServed,
      boundBy: upstream.boundBy,
      span: upstream.span ?? null,
    };
    return proxyOk(toTimelineWire(body, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
  }

  const rows: CompoundV2MvRow[] = [];
  let totalEvents = 0;
  let cursor: string | null = null;
  let cutoffBlock: number | null = null;
  let span: { from: number; to: number } | null = null;
  let lastResponse: Response | null = null;
  // True when the walk hit MAX_PAGES with the backend still saying `hasMore`
  // — the drained rows are then a prefix of the history, and the page's
  // row-ceiling disclosure states it rather than a cut list passing as whole.
  let stoppedShort = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ wallet, limit: String(PAGE_LIMIT) });
    if (recent && page === 0) qs.set("recent", recent);
    // A span is a filter, not a window's floor, so every page carries it.
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (cursor) qs.set("cursor", cursor);
    const response = await fetch(`${hop.baseUrl}/api/compound-v2/timeline?${qs.toString()}`, {
      headers: hop.headers,
    });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const json = (await response.json()) as TimelineRowsResponse;
    rows.push(...json.rows);
    totalEvents = json.totalEvents;
    if (page === 0) {
      cutoffBlock = json.cutoffBlock ?? null;
      span = json.span ?? null;
    }
    lastResponse = response;
    if (!json.hasMore || !json.nextCursor) break;
    cursor = json.nextCursor;
    stoppedShort = page === MAX_PAGES - 1;
  }

  const data = {
    ...withRowCeiling(buildCompoundV2Timeline(rows, wallet, totalEvents), { totalEvents, truncated: stoppedShort }),
    cutoffBlock,
    span,
  };
  return proxyOk(
    toTimelineWire(data, MAINNET_CHAIN_ID),
    lastResponse ? proxyCacheControl(lastResponse, LISTING_CACHE_CONTROL) : undefined,
  );
}

/** `/api/compound-v2/timeline/summary`: the opening balance below `cutoffBlock`,
 *  its market keys resolved to display symbols and decimals. */
export async function readCompoundV2OpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ wallet, cutoffBlock });
  const response = await fetch(`${hop.baseUrl}/api/compound-v2/timeline/summary?${qs.toString()}`, {
    headers: hop.headers,
  });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;
  const opening = resolveOpeningAssetKeys(
    upstream,
    (key) => COMPOUND_V2_MARKET_BY_KEY[key]?.symbol,
    (key) => COMPOUND_V2_MARKET_BY_KEY[key]?.decimals,
  );
  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
