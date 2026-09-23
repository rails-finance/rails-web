// ============================================================================
// FETCH TROVE TIMELINE
// ============================================================================
//
// Thin typed client over /api/trove/:c/:t/timeline (this app's proxy route,
// which forwards to rails-server-onboarding's Express endpoint with the bearer
// token).
//
// Returns events in the unified BaseActivityEvent shape so they drop straight
// into the universal event-card components without an adapter.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { settleFetchMark } from "@/lib/perf/settle-marks";

export interface FetchTroveTimelineResult {
  troveId: string;
  collateralType: string;
  owner: string | null;
  events: BaseActivityEvent[];
  totalEvents: number;
  pagination: { limit: number; offset: number; hasMore: boolean };
}

export interface FetchTroveTimelineParams {
  collateralType: string;
  troveId: string;
  limit?: number;
  offset?: number;
  /** Override base URL for SSR (server components calling the API directly).
   *  Client-side calls hit the same-origin /api proxy by default. */
  baseUrl?: string;
}

export async function fetchTroveTimeline(params: FetchTroveTimelineParams): Promise<FetchTroveTimelineResult> {
  const { collateralType, troveId, limit, offset, baseUrl = "" } = params;
  const search = new URLSearchParams();
  if (limit != null) search.set("limit", String(limit));
  if (offset != null) search.set("offset", String(offset));

  const qs = search.toString();
  const base = `${baseUrl}/api/trove`;
  const url =
    `${base}/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline` + (qs ? `?${qs}` : "");

  const done = settleFetchMark("trove-timeline");
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchTroveTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as FetchTroveTimelineResult;
  done(true);
  return json;
}
