// The f(x) Protocol proxy routes' reads, callable from a route handler and from
// the position page's loader alike (lib/shared/proxy-answer.ts). Each takes the
// proxy's query and a hop to the box, and answers what the route answers; the
// routes' header comments carry the argument for each shape. SERVER-ONLY.

import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFxTimeline, type RawFxTimelineResponse } from "@/lib/sources/api/fx-timeline";
import { isFxPoolKey } from "@/lib/fx/asset-catalog";
import { toTimelineWire } from "@/lib/shared/timeline-wire";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { resolveOpeningAssetKeys, type UpstreamOpeningBalance } from "@/lib/shared/timeline-opening-balance-wire";
import { proxyFail, proxyOk, type ProxyAnswer } from "@/lib/shared/proxy-answer";
import type { SsrHop } from "@/lib/shared/listing-ssr";

/** Answers `/api/fx/position/[pool]/[id]/timeline`. */
export async function readFxTimeline(
  pool: string,
  id: string,
  sp: URLSearchParams,
  hop: SsrHop,
): Promise<ProxyAnswer<unknown>> {
  if (!isFxPoolKey(pool) || !/^\d+$/.test(id)) {
    return proxyFail(400, { success: false, error: "Invalid position" });
  }

  // Passed straight through, validated upstream: rails-server owns the shape
  // of `recent` and answers a bad one with its own 400. The window cuts the
  // mv_fx_events lane only — the ownership and socialized lanes ride the
  // response whole either way.
  const recent = sp.get("recent");
  const recentQs = recent ? `?recent=${encodeURIComponent(recent)}` : "";
  const url = `${hop.baseUrl}/api/fx/position/${pool}/${id}/timeline${recentQs}`;
  const response = await fetch(url, { headers: hop.headers });
  if (response.status === 404) {
    return proxyFail(404, { success: false, error: "Position not found" });
  }
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { success: false, error: `Backend error: ${response.statusText}` });
  }
  const raw = (await response.json()) as RawFxTimelineResponse;
  const result = { ...buildFxTimeline(raw), cutoffBlock: raw.cutoffBlock ?? null };
  return proxyOk(toTimelineWire(result, MAINNET_CHAIN_ID), proxyCacheControl(response, LISTING_CACHE_CONTROL));
}

/** Answers `/api/fx/position/[pool]/[id]/timeline/summary`. */
export async function readFxOpeningBalance(
  pool: string,
  id: string,
  sp: URLSearchParams,
  hop: SsrHop,
): Promise<ProxyAnswer<unknown>> {
  if (!isFxPoolKey(pool) || !/^\d+$/.test(id)) {
    return proxyFail(400, { error: "Invalid position" });
  }
  const cutoffBlock = sp.get("cutoffBlock");
  if (!cutoffBlock) return proxyFail(400, { error: "cutoffBlock is required" });

  const url = `${hop.baseUrl}/api/fx/position/${pool}/${id}/timeline/summary?cutoffBlock=${encodeURIComponent(cutoffBlock)}`;
  const response = await fetch(url, { headers: hop.headers });
  if (!response.ok) {
    console.error(`Backend API error: ${response.status} ${response.statusText}`);
    return proxyFail(response.status, { error: `Backend error: ${response.statusText}` });
  }
  const upstream = (await response.json()) as UpstreamOpeningBalance;
  const opening = resolveOpeningAssetKeys(upstream, () => undefined);
  return proxyOk(opening, proxyCacheControl(response, LISTING_CACHE_CONTROL));
}
