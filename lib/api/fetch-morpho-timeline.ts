// ============================================================================
// FETCH MORPHO TIMELINE
// ============================================================================
//
// A single Morpho position's event history. `positionId` = `${marketIdHex}-${owner}`.
// Reads the LIVE rails-server index (replays the running balances in the proxy
// from the MV's raw deltas). Returns the MorphoTimelineResult.

import type { MorphoTimelineResult } from "@/lib/sources/api/morpho-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchMorphoTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
}

export async function fetchMorphoTimeline(
  positionId: string,
  opts: FetchMorphoTimelineOptions = {},
): Promise<MorphoTimelineResult> {
  const prefix = "/api/morpho/position";
  const recentQs = opts.recent ? `?recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}${prefix}/${encodeURIComponent(positionId)}/timeline${recentQs}`;
  const done = settleFetchMark("morpho-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMorphoTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MorphoTimelineResult>;
  done(true);
  return fromTimelineWire<MorphoTimelineResult>(json);
}
