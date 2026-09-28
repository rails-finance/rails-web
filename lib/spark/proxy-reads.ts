// The SparkLend proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's own query and a hop to the box, and answers what the route answers;
// the routes' header comments carry the argument for each shape.
// SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildSparkPositionRows, type RawSparkWalletRow } from "@/lib/sources/api/spark-positions";
import { buildSparkTimeline, type MvRow } from "@/lib/sources/api/spark-timeline";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import {
  folderLegAddresses,
  toServedFolder,
  type UpstreamGroupedTimeline,
} from "@/lib/sources/api/timeline-folder-wire";
import { SPARK_ADDR_BY_SYMBOL } from "@/lib/spark/asset-catalog";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

// The filter chips are asset SYMBOLS; the rails route filters by token ADDRESS.
// Map here off the same catalog the chips are populated from; raw 0x addresses
// pass through untouched.
function symbolsToAddresses(csvValue: string): string {
  return csvValue
    .split(",")
    .filter(Boolean)
    .map((s) => (s.startsWith("0x") ? s.toLowerCase() : (SPARK_ADDR_BY_SYMBOL[s] ?? "")))
    .filter(Boolean)
    .join(",");
}

interface PositionsRawResponse {
  rows: RawSparkWalletRow[];
  total: number;
  limit: number;
  offset: number;
}

/** `/api/spark/positions`: the { success, data, pagination } envelope. */
export async function readSparkPositions(
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
  if (sp.get("supplyAssets")) qs.set("supplyAssets", symbolsToAddresses(sp.get("supplyAssets")!));
  if (sp.get("borrowAssets")) qs.set("borrowAssets", symbolsToAddresses(sp.get("borrowAssets")!));
  // Allowlist, like sortOrder: an unrecognised value is dropped rather than
  // forwarded verbatim, so rails-server's own default (recent) decides it —
  // same "unrecognised ⇒ default, no error" stance the route takes throughout.
  const sortBy = sp.get("sortBy");
  if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const response = await fetch(`${hop.baseUrl}/api/spark/positions?${qs.toString()}`, {
    signal,
    headers: hop.headers,
  });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = await buildSparkPositionRows(raw.rows);
  return proxyOk(
    { success: true, data, pagination: { total: raw.total, limit: raw.limit, offset: raw.offset } },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
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
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. Null (or
   *  absent, on a backend that predates it) means no span was asked for. */
  span?: { from: number; to: number } | null;
}

/** `/api/spark/timeline`: the wire timeline, flat or `?group=1`. */
export async function readSparkTimeline(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  // Passed straight through, validated upstream: rails-server owns the shape of
  // `recent` and answers a bad one with its own 400. Re-validating it here
  // would be a second opinion about the same parameter, and the two would drift.
  const recent = sp.get("recent");
  // `?from=`/`?to=`: a span of time in unix seconds in place of the newest
  // window, passed straight through for the same reason. Each end is
  // forwarded independently, so a half span reaches upstream and is refused
  // there. Under `group` it names the segment.
  const from = sp.get("from");
  const to = sp.get("to");
  const spanQs = (from ? `&from=${encodeURIComponent(from)}` : "") + (to ? `&to=${encodeURIComponent(to)}` : "");

  if (sp.get("group") === "1") {
    // `recent` is deliberately NOT composed with `group`: under grouping the
    // two bounds are the route's own (a row cap and an event scan bound,
    // whichever binds first), because a caller cannot know how many events
    // fill a thousand rows on this particular position.
    const url = `${hop.baseUrl}/api/spark/timeline?wallet=${encodeURIComponent(wallet)}${spanQs}&group=1`;
    const response = await fetch(url, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<MvRow>;
    // A backend that predates the grouping answers `?group=1` with the FLAT
    // shape — same 200, raw spark_events_served rows rather than wire rows. Saying so
    // is the whole point: transforming it anyway would produce a page of
    // folders that are not folders, and a caller that cannot tell "not
    // deployed yet" from "this position has no folders" would report a
    // green run for a feature that never ran.
    if (upstream.grouped !== true || !Array.isArray(upstream.rows)) {
      return proxyFail(502, {
        error: "Not grouped",
        code: "GROUPING_UNAVAILABLE",
        message: "This backend does not serve grouped timelines yet, so there are no folders to read.",
      });
    }
    const eventRows = upstream.rows.flatMap((r) => (r.kind === "event" ? [r.event] : []));
    // ONE resolver behind both halves of the answer, exactly as the flat
    // branch has one behind its rows: a folder header and the rows beneath
    // it must never disagree about what a symbol is.
    const [data, legMetas] = await Promise.all([
      buildSparkTimeline(eventRows, wallet),
      resolveErc20Meta(folderLegAddresses(upstream.rows)),
    ]);
    const resolve = {
      symbol: (key: string) => legMetas.get(key)?.symbol,
      decimals: (key: string) => (legMetas.get(key)?.unresolved ? undefined : legMetas.get(key)?.decimals),
    };
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: toServedFolder(r.folder, resolve) },
    );
    const body = {
      ...data,
      // The position's own count, not this answer's — the same meaning it
      // carries on the flat branch.
      totalEvents: upstream.totalEvents,
      cutoffBlock: upstream.cutoffBlock ?? null,
      grouped: true as const,
      rowPlan,
      eventsServed: upstream.eventsServed,
      boundBy: upstream.boundBy,
      span: upstream.span ?? null,
    };
    // A leg whose decimals did not load is left off its folder header; the
    // answer is then not kept, like a row carrying one.
    const legsUnread = [...legMetas.values()].some((m) => m.unresolved);
    return proxyOk(
      toTimelineWire(body, MAINNET_CHAIN_ID),
      legsUnread
        ? { "Cache-Control": "no-store" }
        : timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
    );
  }

  const recentQs = recent ? `&recent=${encodeURIComponent(recent)}` : "";
  const url = `${hop.baseUrl}/api/spark/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}${spanQs}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const { rows, totalEvents, truncated, cutoffBlock, span } = (await response.json()) as TimelineRowsResponse;
  const data = await buildSparkTimeline(rows, wallet);
  // The ceiling and the window are different claims and both can be absent.
  // A windowed fetch is never truncated — it asked for a window and got one —
  // so `withRowCeiling` stays exactly as it was and simply never fires.
  const windowed = {
    ...withRowCeiling(data, { totalEvents, truncated }),
    cutoffBlock: cutoffBlock ?? null,
    span: span ?? null,
  };
  return proxyOk(
    toTimelineWire(windowed, MAINNET_CHAIN_ID),
    timelineCacheHeaders(data.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
  );
}

/** `/api/spark/timeline/summary`: the opening balance below `cutoffBlock`, its
 *  token addresses resolved to display symbols and decimals. */
export async function readSparkOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const wallet = sp.get("wallet");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!wallet) return proxyFail(400, { error: "wallet is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const qs = new URLSearchParams({ wallet, cutoffBlock });
  const response = await fetch(`${hop.baseUrl}/api/spark/timeline/summary?${qs.toString()}`, {
    headers: hop.headers,
  });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;

  // Every address the summary names, on either axis, resolved in one batch.
  const addresses = [...(upstream.byAsset ?? []).map((b) => b.key), ...(upstream.flows ?? []).map((f) => f.key)];
  const meta = await resolveErc20Meta(addresses);
  const opening = resolveOpeningAssetKeys(
    upstream,
    (addr) => meta.get(addr.toLowerCase())?.symbol,
    (addr) => (meta.get(addr.toLowerCase())?.unresolved ? undefined : meta.get(addr.toLowerCase())?.decimals),
  );

  // A token whose decimals did not load leaves its bucket's decimals null
  // (unknown, never added), and the answer is not kept.
  const unread = [...meta.values()].some((m) => m.unresolved);
  return proxyOk(
    opening,
    unread ? { "Cache-Control": "no-store" } : proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}
