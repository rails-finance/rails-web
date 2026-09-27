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
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type BasedollarGroupedTimelineResult = BasedollarTimelineResult &
  GroupedTimelineFields & {
    /** The span `?from=`/`?to=` asked for, echoed in unix seconds. Null on the
     *  newest window. */
    span?: { from: number; to: number } | null;
  };

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
  /** A span of time in unix seconds, inclusive, in place of the newest window.
   *  Never given with `recent`: the index refuses the pair. */
  span?: [number, number];
}

export async function fetchBasedollarTimeline(
  collateralType: string,
  troveId: string,
  opts: FetchBasedollarTimelineOptions = {},
): Promise<BasedollarTimelineResult> {
  const qs = new URLSearchParams();
  if (opts.recent) qs.set("recent", String(opts.recent));
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const q = qs.toString();
  const url = `${opts.baseUrl ?? ""}/api/basedollar/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline${q ? `?${q}` : ""}`;
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

/**
 * The same history as ROWS (decision 0019's evening amendment): redemption
 * stretches and the owner's repeated actions arrive as folders carrying their
 * members' aggregate, ungrouped events arrive as themselves, and the cut
 * counts rows. A separate function because it answers a different shape:
 * `events` holds only the ungrouped events. A `span` reads a month grouped the
 * same way (decision 0019, amendment 2026-09-25), echoed back as `span`.
 */
export async function fetchBasedollarGroupedTimeline(
  collateralType: string,
  troveId: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit; span?: [number, number] } = {},
): Promise<BasedollarGroupedTimelineResult> {
  const qs = new URLSearchParams({ group: "1" });
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = `${opts.baseUrl ?? ""}/api/basedollar/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline?${qs.toString()}`;
  const done = settleFetchMark("basedollar-timeline-grouped");
  const res = await fetch(url, { cache: "no-store", signal: opts.signal, headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchBasedollarGroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<BasedollarGroupedTimelineResult>;
  done(true);
  return fromTimelineWire<BasedollarGroupedTimelineResult>(json);
}
