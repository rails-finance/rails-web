// ============================================================================
// FETCH SPARK TIMELINE
// ============================================================================
//
// A single SparkLend wallet's event history, keyed by wallet address. The only
// arm is "api" — the LIVE rails-server index (the proxy maps the raw
// replayed spark_events_served rows → BaseActivityEvent[] via buildSparkTimeline).
// Returns the SparkTimelineResult.

import type { SparkTimelineResult } from "@/lib/sources/api/spark-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type SparkGroupedTimelineResult = SparkTimelineResult & GroupedTimelineFields;

export interface FetchSparkTimelineOptions {
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

export async function fetchSparkTimeline(
  wallet: string,
  opts: FetchSparkTimelineOptions = {},
): Promise<SparkTimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/spark/timeline?${qs.toString()}`;
  const done = settleFetchMark("spark-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchSparkTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<SparkTimelineResult>;
  done(true);
  return fromTimelineWire<SparkTimelineResult>(json);
}

/**
 * The same history as ROWS — decision 0019's evening amendment: repetitive
 * stretches arrive as folders carrying their members' aggregate, ungrouped
 * events arrive as themselves, and the cut counts rows.
 *
 * A separate function rather than an option on the one above, because it
 * answers a DIFFERENT SHAPE: `events` holds only the ungrouped events and is
 * no longer the served history, so a caller that reduces `events` and calls
 * the result a lifetime figure would be wrong in a way a boolean flag would
 * have hidden. `?recent` is not composed with it — under grouping the bounds
 * are the route's own.
 */
export async function fetchSparkGroupedTimeline(
  wallet: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit } = {},
): Promise<SparkGroupedTimelineResult> {
  const qs = new URLSearchParams({ wallet, group: "1" });
  const url = `${opts.baseUrl ?? ""}/api/spark/timeline?${qs.toString()}`;
  const done = settleFetchMark("spark-timeline-grouped");
  const res = await fetch(url, { cache: "no-store", signal: opts.signal, headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchSparkGroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<SparkGroupedTimelineResult>;
  done(true);
  return fromTimelineWire<SparkGroupedTimelineResult>(json);
}
