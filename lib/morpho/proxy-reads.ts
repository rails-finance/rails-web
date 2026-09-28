// The Morpho (Ethereum) proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildMorphoPositionRows, type RawMorphoPositionRow } from "@/lib/sources/api/morpho-positions";
import { withRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import {
  buildMorphoTimeline,
  type RawMorphoTimelineResponse,
  resolveMarketMeta,
} from "@/lib/sources/api/morpho-timeline";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { timelineCacheHeaders } from "@/lib/shared/decimals-unread";
import type { UpstreamGroupedTimeline } from "@/lib/sources/api/timeline-folder-wire";
import { morphoServedFolder } from "@/lib/sources/api/lender-folder-wire";
import type { TimelineRowPlanEntry } from "@/lib/shared/timeline-folder";
import { MORPHO_MARKETS } from "@/lib/morpho/market-catalog";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";
import { resolveErc20Meta } from "@/lib/sources/chain/erc20-meta";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

interface PositionsRawResponse {
  rows: RawMorphoPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

/** Answers `/api/morpho/positions`. */
export async function readMorphoPositions(
  sp: URLSearchParams,
  hop: SsrHop,
  signal?: AbortSignal,
): Promise<ProxyAnswer<unknown>> {
  const qs = new URLSearchParams();
  // `market` may be a CSV of market ids, and `loan` / `coll` are CSVs of
  // ERC-20 addresses — the facet params the listing's market roster feeds.
  if (sp.get("market")) qs.set("market", sp.get("market")!);
  if (sp.get("loan")) qs.set("loan", sp.get("loan")!);
  if (sp.get("coll")) qs.set("coll", sp.get("coll")!);
  if (sp.get("user")) qs.set("user", sp.get("user")!);
  if (sp.get("status")) qs.set("status", sp.get("status")!);
  if (sp.get("sortBy")) qs.set("sortBy", sp.get("sortBy")!);
  qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
  if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
  if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

  const url = `${hop.baseUrl}/api/morpho/positions?${qs.toString()}`;
  const response = await fetch(url, { signal, headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as PositionsRawResponse;
  const data = await buildMorphoPositionRows(raw.rows);
  return proxyOk(
    {
      success: true,
      data,
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
    },
    proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}

/** Answers `/api/morpho/position/[positionId]/timeline`. */
export async function readMorphoTimeline(
  positionId: string,
  sp: URLSearchParams,
  hop: SsrHop,
): Promise<ProxyAnswer<unknown>> {
  // Passed straight through, validated upstream: rails-server owns the shape
  // of `recent` and answers a bad one with its own 400.
  const qs = new URLSearchParams();
  for (const k of ["recent", "from", "to"]) {
    const v = sp.get(k);
    if (v) qs.set(k, v);
  }
  const base = `${hop.baseUrl}/api/morpho/position/${encodeURIComponent(positionId)}/timeline`;

  if (sp.get("group") === "1") {
    qs.delete("recent");
    qs.set("group", "1");
    const response = await fetch(`${base}?${qs.toString()}`, { headers: hop.headers });
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
    }
    const upstream = (await response.json()) as UpstreamGroupedTimeline<RawMorphoTimelineResponse["rows"][number]> &
      Omit<RawMorphoTimelineResponse, "rows">;
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
    const [result, meta] = await Promise.all([
      buildMorphoTimeline({ ...upstream, rows: eventRows }),
      resolveMarketMeta(upstream.marketId, upstream.marketParams),
    ]);
    const rowPlan: TimelineRowPlanEntry[] = upstream.rows.map((r) =>
      r.kind === "event" ? { kind: "event" } : { kind: "folder", folder: morphoServedFolder(r.folder, meta) },
    );
    const body = {
      ...result,
      totalEvents: upstream.totalEvents,
      cutoffBlock: upstream.cutoffBlock ?? null,
      grouped: true as const,
      rowPlan,
      eventsServed: upstream.eventsServed,
      boundBy: upstream.boundBy,
      span: upstream.span ?? null,
    };
    return proxyOk(
      toTimelineWire(body, MAINNET_CHAIN_ID),
      timelineCacheHeaders(result.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
    );
  }

  const url = qs.toString() ? `${base}?${qs.toString()}` : base;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as RawMorphoTimelineResponse;
  const result = await buildMorphoTimeline(raw);
  // The ceiling and the window are different claims and both can be absent.
  const windowed = {
    ...withRowCeiling(result, { totalEvents: raw.totalEvents, truncated: raw.truncated }),
    cutoffBlock: raw.cutoffBlock ?? null,
    span: (raw as { span?: { from: number; to: number } | null }).span ?? null,
  };
  return proxyOk(
    toTimelineWire(windowed, MAINNET_CHAIN_ID),
    timelineCacheHeaders(result.events, proxyCacheControl(response, LISTING_CACHE_CONTROL)),
  );
}

/** Answers `/api/morpho/timeline/summary`. */
export async function readMorphoOpeningBalance(sp: URLSearchParams, hop: SsrHop): Promise<ProxyAnswer<unknown>> {
  const positionId = sp.get("positionId");
  const cutoffBlock = sp.get("cutoffBlock");
  if (!positionId) return proxyFail(400, { error: "positionId is required" });
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const { market } = splitMorphoPositionId(positionId);
  const marketId = market.startsWith("0x") ? market.toLowerCase() : `0x${market.toLowerCase()}`;
  const entry = MORPHO_MARKETS.find((m) => m.id === marketId);

  const qs = new URLSearchParams({ positionId, cutoffBlock });
  const url = `${hop.baseUrl}/api/morpho/timeline/summary?${qs.toString()}`;
  const [response, meta] = await Promise.all([
    fetch(url, { headers: hop.headers }),
    entry ? resolveErc20Meta([entry.loanToken, entry.collateralToken]) : Promise.resolve(null),
  ]);
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;
  const decimalsOf = (key: string): number | undefined => {
    if (!entry || !meta) return undefined;
    const token = key === "collateral" ? entry.collateralToken : key === "debt" ? entry.loanToken : null;
    const m = token ? meta.get(token.toLowerCase()) : undefined;
    return m && !m.unresolved ? m.decimals : undefined;
  };
  const opening = resolveOpeningAssetKeys(upstream, () => undefined, decimalsOf);
  // A token whose decimals did not load leaves its bucket's decimals null
  // (unknown, never added), and the answer is not kept.
  const unread = !!meta && [...meta.values()].some((m) => m.unresolved);
  return proxyOk(
    opening,
    unread ? { "Cache-Control": "no-store" } : proxyCacheControl(response, LISTING_CACHE_CONTROL),
  );
}
