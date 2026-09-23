// ============================================================================
// FETCH BASEDOLLAR TIMELINE
// ============================================================================
//
// A single Basedollar Trove's full history, keyed by (branch, troveId). The only arm is
// "api" — the LIVE rails-server index (the proxy maps the raw mv_basedollar_events rows →
// BaseActivityEvent[] via buildBasedollarTimeline). Returns the BasedollarTimelineResult.

import type { BasedollarTimelineResult } from "@/lib/sources/api/basedollar-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchBasedollarTimelineOptions {
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

export async function fetchBasedollarTimeline(
  collateralType: string,
  troveId: string,
  opts: FetchBasedollarTimelineOptions = {},
): Promise<BasedollarTimelineResult> {
  const recentQs = opts.recent ? `?recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}/api/basedollar/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline${recentQs}`;
  const done = settleFetchMark("basedollar-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchBasedollarTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<BasedollarTimelineResult>;
  done(true);
  return fromTimelineWire<BasedollarTimelineResult>(json);
}
