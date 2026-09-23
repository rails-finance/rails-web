// ============================================================================
// FETCH FRANKENCOIN TIMELINE
// ============================================================================
//
// A single Frankencoin POSITION's event history, keyed exactly as the protocol
// keys it: the Position contract's own address. The only arm is "api" — the
// LIVE rails-server index. The rails route pages by keyset cursor; this
// deployment's proxy walks the cursor server-side and returns the assembled
// { position, events, totalEvents }. `totalEvents` is the position's WHOLE
// history as the backend counts it; `events.length` can fall short only if
// the proxy's page cap tripped.

import type { FrankencoinTimelineResult } from "@/lib/sources/api/frankencoin-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchFrankencoinTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
}

export async function fetchFrankencoinTimeline(
  position: string,
  opts: FetchFrankencoinTimelineOptions = {},
): Promise<FrankencoinTimelineResult> {
  const qs = new URLSearchParams({ position });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/frankencoin/timeline?${qs.toString()}`;
  const done = settleFetchMark("frankencoin-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchFrankencoinTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<FrankencoinTimelineResult>;
  done(true);
  return fromTimelineWire<FrankencoinTimelineResult>(json);
}
