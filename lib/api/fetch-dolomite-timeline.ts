// ============================================================================
// FETCH DOLOMITE TIMELINE
// ============================================================================
//
// A single Dolomite ACCOUNT's event history, keyed exactly as the contract
// keys it: Account.Info = (owner, uint256 accountNumber) — both params
// required, accountNumber a STRING (uint256; hash-derived numbers are past
// 2^53). The only arm is "api" — the LIVE rails-server index. The rails route
// pages by keyset cursor; this deployment's proxy walks the cursor server-side
// and returns the assembled { owner, accountNumber, events, totalEvents }.
// `totalEvents` is the account's WHOLE history as the backend counts it;
// `events.length` can fall short only if the proxy's page cap tripped.

import type { DolomiteTimelineResult } from "@/lib/sources/api/dolomite-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchDolomiteTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
}

export async function fetchDolomiteTimeline(
  owner: string,
  accountNumber: string,
  opts: FetchDolomiteTimelineOptions = {},
): Promise<DolomiteTimelineResult> {
  const qs = new URLSearchParams({ owner, accountNumber });
  if (opts.recent) qs.set("recent", String(opts.recent));
  const url = `${opts.baseUrl ?? ""}/api/dolomite/timeline?${qs.toString()}`;
  const done = settleFetchMark("dolomite-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchDolomiteTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<DolomiteTimelineResult>;
  done(true);
  return fromTimelineWire<DolomiteTimelineResult>(json);
}
