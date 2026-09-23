// ============================================================================
// FETCH AAVE V3 TIMELINE
// ============================================================================
//
// A wallet's Aave V3 activity, in the shared { wallet, events, totalEvents }
// shape. Served by the live rails-server index — raw mv_aave_v3_events rows
// transformed in the Next route into BaseActivityEvent[] carrying AaveV3Context.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { TimelineRowCeiling } from "@/lib/shared/timeline-row-ceiling";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

export interface AaveV3TimelineResponse {
  wallet: string;
  events: BaseActivityEvent[];
  /** Events in THIS response, not the position's own count. On a windowed fetch
   *  (`recent`) that is the window; the position's total is the window plus the
   *  opening balance below `cutoffBlock`, and `rowCeiling.total` on an
   *  unwindowed fetch that hit the index's ceiling. */
  totalEvents: number;
  /** Present only when the index's row ceiling cut this fetch. See
   *  lib/shared/timeline-row-ceiling.ts. */
  rowCeiling?: TimelineRowCeiling;
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — which is the answer
   *  whenever `recent` was not asked for, and also when the position holds
   *  fewer events than the window. */
  cutoffBlock?: number | null;
  /** The span `?from=`/`?to=` asked for, echoed in unix seconds, so a caller
   *  can tell a span answer from a whole-history one without comparing its own
   *  request to the rows. Null means no span was asked for. */
  span?: { from: number; to: number } | null;
}

export interface FetchAaveV3TimelineParams {
  wallet: string;
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Which Aave V3 market's history to fold (core | prime | etherfi). A position
   *  is per (wallet, market) — merging two markets' events together would conflate
   *  their per-reserve baskets — so the detail page passes the row's market.
   *  Omitted = all markets (back-compat; correct for a single-market wallet). */
  market?: string;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened; everything below that block is
   *  an opening balance the page fetches from the /summary twin. Omitted keeps
   *  the whole-history fetch, which is the right answer for all but a handful
   *  of positions and the only one for a caller that reduces the array itself
   *  without seeding from a summary. */
  recent?: number;
  /** Ask for a SPAN OF TIME instead — unix seconds, UTC, inclusive at both
   *  ends — for a reader who pointed at one month or one day in the middle of
   *  the history rather than at its newest end. Never given with `recent`: the
   *  two are different windows and the index refuses the pair. A span answer
   *  brings no opening balance forward, because a stretch in the middle of a
   *  history is not the newest slice of anything. */
  span?: [number, number];
}

export async function fetchAaveV3Timeline(p: FetchAaveV3TimelineParams): Promise<AaveV3TimelineResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  if (p.market) qs.set("market", p.market);
  if (p.recent) qs.set("recent", String(p.recent));
  if (p.span) {
    qs.set("from", String(p.span[0]));
    qs.set("to", String(p.span[1]));
  }
  const url = `${p.baseUrl ?? ""}/api/aave-v3/timeline?${qs.toString()}`;
  const done = settleFetchMark("aave-v3-timeline");
  const res = await fetch(url, { cache: "no-store", headers: p.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchAaveV3Timeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<AaveV3TimelineResponse>;
  done(true);
  return fromTimelineWire<AaveV3TimelineResponse>(json);
}

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type AaveV3GroupedTimelineResponse = AaveV3TimelineResponse & GroupedTimelineFields;

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
export async function fetchAaveV3GroupedTimeline(p: {
  wallet: string;
  market?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
}): Promise<AaveV3GroupedTimelineResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet, group: "1" });
  if (p.market) qs.set("market", p.market);
  const url = `${p.baseUrl ?? ""}/api/aave-v3/timeline?${qs.toString()}`;
  const done = settleFetchMark("aave-v3-timeline-grouped");
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchAaveV3GroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<AaveV3GroupedTimelineResponse>;
  done(true);
  return fromTimelineWire<AaveV3GroupedTimelineResponse>(json);
}
