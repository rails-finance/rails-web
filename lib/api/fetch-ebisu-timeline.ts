// ============================================================================
// FETCH EBISU TIMELINE
// ============================================================================
//
// A single Ebisu Trove's full history, keyed by (branch, troveId). The only arm is
// "api" — the LIVE rails-server index (the proxy maps the raw mv_ebisu_events rows →
// BaseActivityEvent[] via buildEbisuTimeline). Returns the EbisuTimelineResult.

import type { EbisuTimelineResult } from "@/lib/sources/api/ebisu-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchEbisuTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch, which is the right answer for
   *  all but a handful of positions and the only one for a caller that reduces
   *  the array itself without seeding from a summary. */
  recent?: number;
}

export async function fetchEbisuTimeline(
  collateralType: string,
  troveId: string,
  opts: FetchEbisuTimelineOptions = {},
): Promise<EbisuTimelineResult> {
  const recentQs = opts.recent ? `?recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}/api/ebisu/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline${recentQs}`;
  const done = settleFetchMark("ebisu-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchEbisuTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<EbisuTimelineResult>;
  done(true);
  return fromTimelineWire<EbisuTimelineResult>(json);
}
