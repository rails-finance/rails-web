// The Maple proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMaplePositionRows, type RawMapleWalletRow } from "@/lib/sources/api/maple-positions";
import { MAPLE_KEY_BY_SYMBOL, maplePoolOf } from "@/lib/maple/asset-catalog";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { buildMapleTimeline, type MvRow } from "@/lib/sources/api/maple-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { mapleServedFolder } from "@/lib/sources/api/lender-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

// The filter chips are share-token SYMBOLS; the rails route filters by pool
// KEY. Map off the same catalog the chips are populated from; raw keys pass
// through untouched.
function symbolsToPoolKeys(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .map((s) => MAPLE_KEY_BY_SYMBOL[s] ?? s.toLowerCase())
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawMapleWalletRow[];
  total: number;
  limit: number;
  offset: number;
}

interface TimelineRowsResponse {
  wallet: string;
  rows: MvRow[];
  totalEvents: number;
  /** The index's row ceiling cut this query, so `rows` is short of
   *  `totalEvents`. Optional — a backend that predates the field means the
   *  fetch was not capped, and the page reads exactly as it did before. */
  truncated?: boolean;
  /** Where `?recent=N` drew the line: `rows` holds every event from this block
   *  onward and everything below it is the opening balance, fetched from the
   *  /summary twin with THIS number. Null (or absent, on a backend that
   *  predates it) means the rows ARE the whole history. */
  cutoffBlock?: number | null;
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
  span?: { from: number; to: number } | null;
}

/** Answers `/api/maple/positions`. */
export async function readMaplePositions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("inQueue")) qs.set("inQueue", sp.get("inQueue")!);
  if (sp.get("pools")) qs.set("pools", symbolsToPoolKeys(sp.get("pools")!));
  // Allowlist, like sortOrder: an unrecognised value is dropped rather than
  // forwarded verbatim, so rails-server's own default (recent) decides it.
  // No "debt" — a Maple lender position has no debt side.
  const sortBy = sp.get("sortBy");
  if (sortBy === "coll") qs.set("sortBy", sortBy);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/maple/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const { rows, poolState } = await buildMaplePositionRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data: rows,
      poolState,
      // The browse listing's total already leaves out the known contracts
      // (server mig 227's list, the same one the row builder filters by), so
      // nothing is dropped there. A `?wallet=` lookup is exempt server-side:
      // when the builder drops that one row, the total drops with it.
      pagination: { total: raw.total - (raw.rows.length - rows.length), limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/maple/timeline`. */
export async function readMapleTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");
  const from = sp.get("from");
  const to = sp.get("to");

  if (sp.get("group") === "1") {
    const qs = new URLSearchParams({ wallet, group: "1" });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const response = await fetch(`${hop.baseUrl}/api/maple/timeline?${qs.toString()}`, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
    // A backend that predates the grouping answers the flat shape; reading it
    // as rows would draw a page of folders that are not folders.
    if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
      return proxyFail(502, {
        error: "Not grouped",
        code: "GROUPING_UNAVAILABLE",
        message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
      });
    }
    const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
    const data = buildMapleTimeline(eventRows, wallet);
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: mapleServedFolder(r.folder) },
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

  const qs = new URLSearchParams({ wallet });
  if (recent) qs.set("recent", recent);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const url = `${hop.baseUrl}/api/maple/timeline?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock, span } = (await response.json()) as TimelineRowsResponse;
  const data = buildMapleTimeline(rows, wallet);
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = {
    ...withRowCeiling(data, { totalEvents, truncated }),
    cutoffBlock: cutoffBlock ?? null,
    span: span ?? null,
  };
  return proxyOk(toTimelineWire(windowed, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
}

/** Answers `/api/maple/timeline/summary`. */
export async function readMapleOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ wallet, cutoffBlock });
  const url = `${hop.baseUrl}/api/maple/timeline/summary?${qs.toString()}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  const opening = resolveOpeningAssetKeys(
    upstream,
    (key) => maplePoolOf(key).assetSymbol,
    (key) => maplePoolOf(key).decimals,
  );

  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
