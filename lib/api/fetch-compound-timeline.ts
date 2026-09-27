// ============================================================================
// FETCH COMPOUND TIMELINE
// ============================================================================
//
// A single Comet wallet's event history, keyed by wallet address (optionally
// scoped to one market). The only arm is "api" — the LIVE rails-server index
// (the proxy maps the raw replayed MV rows → BaseActivityEvent[] via
// buildCompoundTimeline). Returns the CompoundTimelineResult.

import type { CompoundTimelineResult } from "@/lib/sources/api/compound-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type CompoundGroupedTimelineResult = CompoundTimelineResult &
  GroupedTimelineFields & {
    /** The span `?from=`/`?to=` asked for, echoed in unix seconds. Null on the
     *  newest window. */
    span?: { from: number; to: number } | null;
  };

export interface FetchCompoundTimelineOptions {
  /** Restrict to one Comet market (omit for all the wallet's markets). */
  market?: string;
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

export async function fetchCompoundTimeline(
  wallet: string,
  opts: FetchCompoundTimelineOptions = {},
): Promise<CompoundTimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.market) qs.set("market", opts.market);
  if (opts.recent) qs.set("recent", String(opts.recent));
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = `${opts.baseUrl ?? ""}/api/compound/timeline?${qs.toString()}`;
  const done = settleFetchMark("compound-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchCompoundTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<CompoundTimelineResult>;
  done(true);
  return fromTimelineWire<CompoundTimelineResult>(json);
}

/**
 * The same history as ROWS (decision 0019's evening amendment) for one
 * (market, account): repetitive stretches arrive as folders carrying their
 * members' aggregate, ungrouped events as themselves, and the cut counts rows.
 * A separate function because it answers a different shape: `events` holds
 * only the ungrouped events. A `span` reads a month grouped the same way
 * (decision 0019, amendment 2026-09-25), echoed back as `span`.
 */
export async function fetchCompoundGroupedTimeline(
  wallet: string,
  market: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit; span?: [number, number] } = {},
): Promise<CompoundGroupedTimelineResult> {
  const qs = new URLSearchParams({ wallet, market, group: "1" });
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = `${opts.baseUrl ?? ""}/api/compound/timeline?${qs.toString()}`;
  const done = settleFetchMark("compound-timeline-grouped");
  const res = await fetch(url, { cache: "no-store", signal: opts.signal, headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchCompoundGroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<CompoundGroupedTimelineResult>;
  done(true);
  return fromTimelineWire<CompoundGroupedTimelineResult>(json);
}
