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
}

export async function fetchCompoundTimeline(
  wallet: string,
  opts: FetchCompoundTimelineOptions = {},
): Promise<CompoundTimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.market) qs.set("market", opts.market);
  if (opts.recent) qs.set("recent", String(opts.recent));
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
