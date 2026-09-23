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

export interface FetchCompoundV2TimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
}

export async function fetchCompoundV2Timeline(
  wallet: string,
  opts: FetchCompoundV2TimelineOptions = {},
): Promise<CompoundV2TimelineResult> {
  const recentQs = opts.recent ? `&recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}/api/compound-v2/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
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
