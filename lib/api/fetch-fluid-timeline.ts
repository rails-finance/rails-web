// ============================================================================
// FETCH FLUID TIMELINE
// ============================================================================
//
// A single Fluid position's event history, keyed by the position NFT id. The
// only arm is "api" — the LIVE rails-server index (the proxy maps the raw
// replayed MV rows → BaseActivityEvent[] via buildFluidTimeline). Returns the
// FluidTimelineResult plus where a `recent` window opened.

import type { FluidTimelineResult } from "@/lib/sources/api/fluid-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FluidTimelineResponse extends FluidTimelineResult {
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — which is the answer
   *  whenever `recent` was not asked for, and also when the position holds
   *  fewer events than the window. */
  cutoffBlock?: number | null;
}

export interface FetchFluidTimelineOptions {
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

export async function fetchFluidTimeline(
  nftId: string,
  opts: FetchFluidTimelineOptions = {},
): Promise<FluidTimelineResponse> {
  const recentQs = opts.recent ? `&recent=${encodeURIComponent(String(opts.recent))}` : "";
  const url = `${opts.baseUrl ?? ""}/api/fluid/timeline?nft=${encodeURIComponent(nftId)}${recentQs}`;
  const done = settleFetchMark("fluid-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchFluidTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<FluidTimelineResponse>;
  done(true);
  return fromTimelineWire<FluidTimelineResponse>(json);
}
