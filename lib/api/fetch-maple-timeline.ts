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
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

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
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
  span?: { from: number; to: number } | null;
}

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type MapleGroupedTimelineResult = MapleTimelineResponse & GroupedTimelineFields;

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
  /** A span of time in unix seconds, inclusive, in place of the newest window.
   *  Never given with `recent`: the index refuses the pair. */
  span?: [number, number];
}

export async function fetchMapleTimeline(
  wallet: string,
  opts: FetchMapleTimelineOptions = {},
): Promise<MapleTimelineResponse> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
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

/**
 * The same history as ROWS (decision 0019's evening amendment): repetitive
 * stretches arrive as folders carrying their members' aggregate, ungrouped
 * events arrive as themselves, and the cut counts rows. A separate function
 * because it answers a different shape: `events` holds only the ungrouped
 * events. A `span` reads a month grouped the same way (decision 0019,
 * amendment 2026-09-25), echoed back as `span`.
 */
export async function fetchMapleGroupedTimeline(
  wallet: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit; span?: [number, number] } = {},
): Promise<MapleGroupedTimelineResult> {
  const qs = new URLSearchParams({ wallet, group: "1" });
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = `${opts.baseUrl ?? ""}/api/maple/timeline?${qs.toString()}`;
  const done = settleFetchMark("maple-timeline-grouped");
  const res = await fetch(url, { cache: "no-store", signal: opts.signal, headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMapleGroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MapleGroupedTimelineResult>;
  done(true);
  return fromTimelineWire<MapleGroupedTimelineResult>(json);
}
