// ============================================================================
// FETCH COMPOUND V2 TIMELINE
// ============================================================================
//
// A single Compound V2 wallet's event history, keyed by wallet address. The
// only arm is "api" — the LIVE rails-server index. The rails route pages by
// keyset cursor (six years of history — the roster's deepest borrowers run
// long); this deployment's proxy walks the cursor server-side and returns the
// assembled { wallet, events, totalEvents }, so callers see the moonwell-shape
// result. `totalEvents` is the wallet's WHOLE history as the backend counts
// it; `events.length` can fall short only if the proxy's page cap tripped.

import type { CompoundV2TimelineResult } from "@/lib/sources/api/compound-v2-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type CompoundV2GroupedTimelineResult = CompoundV2TimelineResult &
  GroupedTimelineFields & {
    /** The span `?from=`/`?to=` asked for, echoed in unix seconds. Null on the
     *  newest window. */
    span?: { from: number; to: number } | null;
  };

export interface FetchCompoundV2TimelineOptions {
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

export async function fetchCompoundV2Timeline(
  wallet: string,
  opts: FetchCompoundV2TimelineOptions = {},
): Promise<CompoundV2TimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = `${opts.baseUrl ?? ""}/api/compound-v2/timeline?${qs.toString()}`;
  const done = settleFetchMark("compound-v2-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchCompoundV2Timeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<CompoundV2TimelineResult>;
  done(true);
  return fromTimelineWire<CompoundV2TimelineResult>(json);
}

/**
 * The same history as ROWS (decision 0019's evening amendment): repetitive
 * stretches arrive as folders carrying their members' aggregate, ungrouped
 * events arrive as themselves, and the cut counts rows. A separate function
 * because it answers a different shape: `events` holds only the ungrouped
 * events. A `span` reads a month grouped the same way (decision 0019,
 * amendment 2026-09-25), echoed back as `span`.
 */
export async function fetchCompoundV2GroupedTimeline(
  wallet: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit; span?: [number, number] } = {},
): Promise<CompoundV2GroupedTimelineResult> {
  const qs = new URLSearchParams({ wallet, group: "1" });
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = `${opts.baseUrl ?? ""}/api/compound-v2/timeline?${qs.toString()}`;
  const done = settleFetchMark("compound-v2-timeline-grouped");
  const res = await fetch(url, { cache: "no-store", signal: opts.signal, headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchCompoundV2GroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<CompoundV2GroupedTimelineResult>;
  done(true);
  return fromTimelineWire<CompoundV2GroupedTimelineResult>(json);
}
