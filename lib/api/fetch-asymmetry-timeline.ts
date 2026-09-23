// ============================================================================
// FETCH ASYMMETRY TIMELINE
// ============================================================================
//
// A single Asymmetry Trove's full history, keyed by (branch, troveId). The only arm is
// "api" — the LIVE rails-server index (the proxy maps the raw mv_asymmetry_events rows →
// BaseActivityEvent[] via buildAsymmetryTimeline). Returns the AsymmetryTimelineResult.

import type { AsymmetryTimelineResult } from "@/lib/sources/api/asymmetry-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchAsymmetryTimelineOptions {
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

export async function fetchAsymmetryTimeline(
  collateralType: string,
  troveId: string,
  opts: FetchAsymmetryTimelineOptions = {},
): Promise<AsymmetryTimelineResult> {
  const recentQs = opts.recent ? `?recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}/api/asymmetry/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline${recentQs}`;
  const done = settleFetchMark("asymmetry-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchAsymmetryTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<AsymmetryTimelineResult>;
  done(true);
  return fromTimelineWire<AsymmetryTimelineResult>(json);
}
