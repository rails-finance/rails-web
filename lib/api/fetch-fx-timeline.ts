// ============================================================================
// FETCH FX TIMELINE
// ============================================================================
//
// A single f(x) V2 position's history, keyed (pool, positionId). Served by the
// LIVE rails-server index (raw event rows shaped in the proxy). Returns the
// FxTimelineResult: the position summary (with settled chain state) + events.

import type { FxTimelineResult } from "@/lib/sources/api/fx-timeline";
import type { FxPoolKey } from "@/lib/fx/asset-catalog";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchFxTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N mv_fx_events-lane events instead of
   *  the whole history — the ownership and socialized lanes ride whole either
   *  way. The response says where the window opened (`cutoffBlock`);
   *  everything below that block on the MV lane is an opening balance the
   *  page fetches from the /summary twin. Omitted keeps the whole-history
   *  fetch. */
  recent?: number;
}

export async function fetchFxTimeline(
  pool: FxPoolKey,
  positionId: string,
  opts: FetchFxTimelineOptions = {},
): Promise<FxTimelineResult> {
  const recentQs = opts.recent ? `?recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}/api/fx/position/${pool}/${encodeURIComponent(positionId)}/timeline${recentQs}`;
  const done = settleFetchMark("fx-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchFxTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<FxTimelineResult>;
  done(true);
  return fromTimelineWire<FxTimelineResult>(json);
}
