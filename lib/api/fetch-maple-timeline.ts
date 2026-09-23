// ============================================================================
// FETCH MAPLE TIMELINE
// ============================================================================
//
// A single Maple wallet's event history, keyed by wallet address. The only
// arm is "api" — the LIVE rails-server index (the proxy maps the raw replayed
// MV rows → BaseActivityEvent[] via buildMapleTimeline). Returns the
// MapleTimelineResult.

import type { MapleTimelineResult } from "@/lib/sources/api/maple-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

/** What the route returns: the transform's result plus the one field the route
 *  itself attaches. The transform reduces rows and knows nothing about where a
 *  window opened, so `cutoffBlock` belongs here rather than on its result. */
export interface MapleTimelineResponse extends MapleTimelineResult {
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — which is the answer
   *  whenever `recent` was not asked for, and also when the wallet holds fewer
   *  events than the window. */
  cutoffBlock?: number | null;
}

export interface FetchMapleTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened; everything below that block is
   *  an opening balance the page fetches from the /summary twin. Omitted keeps
   *  the whole-history fetch, which is the right answer for all but a handful
   *  of positions and the only one for a caller that reduces the array itself
   *  without seeding from a summary. */
  recent?: number;
}

export async function fetchMapleTimeline(
  wallet: string,
  opts: FetchMapleTimelineOptions = {},
): Promise<MapleTimelineResponse> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/maple/timeline?${qs.toString()}`;
  const done = settleFetchMark("maple-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMapleTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MapleTimelineResponse>;
  done(true);
  return fromTimelineWire<MapleTimelineResponse>(json);
}
