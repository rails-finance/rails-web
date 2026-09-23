// ============================================================================
// FETCH LLAMALEND TIMELINE
// ============================================================================
//
// A single LlamaLend POSITION's event history, keyed exactly as the protocol
// keys it: (controller, user) — both params required, the controller being
// the isolated market's own address. The only arm is "api" — the LIVE
// rails-server index. The rails route pages by keyset cursor; this
// deployment's proxy walks the cursor server-side and returns the assembled
// { controller, user, events, totalEvents }. `totalEvents` is the position's
// WHOLE history as the backend counts it; `events.length` can fall short only
// if the proxy's page cap tripped.

import type { LlamalendTimelineResult } from "@/lib/sources/api/llamalend-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchLlamalendTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
}

export async function fetchLlamalendTimeline(
  controller: string,
  user: string,
  opts: FetchLlamalendTimelineOptions = {},
): Promise<LlamalendTimelineResult> {
  const qs = new URLSearchParams({ controller, user });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/llamalend/timeline?${qs.toString()}`;
  const done = settleFetchMark("llamalend-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchLlamalendTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<LlamalendTimelineResult>;
  done(true);
  return fromTimelineWire<LlamalendTimelineResult>(json);
}
