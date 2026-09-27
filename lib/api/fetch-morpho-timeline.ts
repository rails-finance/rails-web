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
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type MorphoGroupedTimelineResult = MorphoTimelineResult &
  GroupedTimelineFields & {
    /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
    span?: { from: number; to: number } | null;
  };

export interface FetchMorphoTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
  /** A span of time in unix seconds, inclusive, in place of the newest window.
   *  Never given with `recent`: the index refuses the pair. */
  span?: [number, number];
}

function morphoTimelineUrl(positionId: string, baseUrl: string | undefined, qs: URLSearchParams): string {
  const q = qs.toString();
  return `${baseUrl ?? ""}/api/morpho/position/${encodeURIComponent(positionId)}/timeline${q ? `?${q}` : ""}`;
}

export async function fetchMorphoTimeline(
  positionId: string,
  opts: FetchMorphoTimelineOptions = {},
): Promise<MorphoTimelineResult> {
  const qs = new URLSearchParams();
  if (opts.recent) qs.set("recent", String(opts.recent));
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = morphoTimelineUrl(positionId, opts.baseUrl, qs);
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

/**
 * The same history as ROWS (decision 0019's evening amendment): repetitive
 * stretches arrive as folders carrying their members' aggregate, ungrouped
 * events arrive as themselves, and the cut counts rows. A separate function
 * because it answers a different shape: `events` holds only the ungrouped
 * events. A `span` reads a month grouped the same way (decision 0019,
 * amendment 2026-09-25), echoed back as `span`.
 */
export async function fetchMorphoGroupedTimeline(
  positionId: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit; span?: [number, number] } = {},
): Promise<MorphoGroupedTimelineResult> {
  const qs = new URLSearchParams({ group: "1" });
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const done = settleFetchMark("morpho-timeline-grouped");
  const res = await fetch(morphoTimelineUrl(positionId, opts.baseUrl, qs), {
    cache: "no-store",
    signal: opts.signal,
    headers: opts.headers,
  });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMorphoGroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MorphoGroupedTimelineResult>;
  done(true);
  return fromTimelineWire<MorphoGroupedTimelineResult>(json);
}
