// ============================================================================
// FETCH LIQUITY V1 TIMELINE
// ============================================================================
//
// A single Liquity V1 Trove's full history, keyed by wallet address. The only arm
// is "api" — the LIVE rails-server index (the proxy maps the raw merged MV rows →
// BaseActivityEvent[] via buildLiquityV1Timeline). Returns the LiquityV1TimelineResult.

import type { LiquityV1TimelineResult } from "@/lib/sources/api/liquity-v1-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchLiquityV1TimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. The window is drawn over the WALLET's stream, which is the grain the
   *  index cuts at — a wallet's Trove lives are consecutive stretches of it.
   *  Omitted keeps the whole-history fetch, the right answer for all but a
   *  handful of wallets and the only one for a caller that reduces the array
   *  itself without seeding from a summary. */
  recent?: number;
}

export async function fetchLiquityV1Timeline(
  wallet: string,
  opts: FetchLiquityV1TimelineOptions = {},
): Promise<LiquityV1TimelineResult> {
  const qs = new URLSearchParams({ wallet });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/liquity-v1/timeline?${qs.toString()}`;
  const done = settleFetchMark("liquity-v1-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchLiquityV1Timeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<LiquityV1TimelineResult>;
  done(true);
  return fromTimelineWire<LiquityV1TimelineResult>(json);
}
