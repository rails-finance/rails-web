// ============================================================================
// FETCH MOONWELL TIMELINE
// ============================================================================
//
// A single Moonwell wallet's event history, keyed by wallet address. The only
// arm is "api" — the LIVE rails-server index (the proxy maps the raw replayed
// MV rows → BaseActivityEvent[] via buildMoonwellTimeline). Returns the
// MoonwellTimelineResult.

import type { MoonwellTimelineResult } from "@/lib/sources/api/moonwell-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchMoonwellTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole
   *  history. The response says where the window opened (`cutoffBlock`);
   *  everything below that block is an opening balance the page fetches from
   *  the /summary twin. Omitted keeps the whole-history fetch, which is the
   *  right answer for all but a handful of positions. */
  recent?: number;
}

export async function fetchMoonwellTimeline(
  wallet: string,
  opts: FetchMoonwellTimelineOptions = {},
): Promise<MoonwellTimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/moonwell/timeline?${qs.toString()}`;
  const done = settleFetchMark("moonwell-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMoonwellTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MoonwellTimelineResult>;
  done(true);
  return fromTimelineWire<MoonwellTimelineResult>(json);
}
