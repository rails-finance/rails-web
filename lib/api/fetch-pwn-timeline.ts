// ============================================================================
// FETCH PWN TIMELINE
// ============================================================================
//
// A single PWN wallet's loan-lifecycle history, keyed by wallet address. A wallet
// is a lender OR a borrower (dual role), so the timeline spans every loan it is a
// party to. The only arm is "api" — the LIVE rails-server index (the proxy maps
// the raw mv_pwn_events rows → BaseActivityEvent[] via buildPwnTimeline). Returns
// the PwnTimelineResult.

import type { PwnTimelineResult } from "@/lib/sources/api/pwn-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchPwnTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened; everything below that block is
   *  an opening balance the page fetches from the /summary twin. Omitted keeps
   *  the whole-history fetch — the right answer for every PWN wallet in the
   *  index today, since even the deepest holds a few dozen events. */
  recent?: number;
}

export interface FetchPwnTimelineResult extends PwnTimelineResult {
  /** Where a `recent` window opened: `events` holds every event from this block
   *  onward, and the opening balance below it is fetched separately with THIS
   *  number. Null means `events` IS the whole history — the answer whenever
   *  `recent` was not asked for, and also when the wallet holds fewer events
   *  than the window. */
  cutoffBlock?: number | null;
}

export async function fetchPwnTimeline(
  wallet: string,
  opts: FetchPwnTimelineOptions = {},
): Promise<FetchPwnTimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/pwn/timeline?${qs.toString()}`;
  const done = settleFetchMark("pwn-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchPwnTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<FetchPwnTimelineResult>;
  done(true);
  return fromTimelineWire<FetchPwnTimelineResult>(json);
}
