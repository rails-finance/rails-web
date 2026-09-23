// ============================================================================
// FETCH MAKERDAO TIMELINE
// ============================================================================
//
// A single MakerDAO vault's history. `vaultId` is the CdpManager id (a urn address
// also resolves). Served by the LIVE rails-server index (replays the running ink/art
// in the proxy from the MV's raw deltas). Returns the MakerTimelineResult.

import type { MakerTimelineResult } from "@/lib/sources/api/makerdao-timeline";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

export interface FetchMakerTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
}

export async function fetchMakerTimeline(
  vaultId: string,
  opts: FetchMakerTimelineOptions = {},
): Promise<MakerTimelineResult> {
  const prefix = "/api/makerdao/vault";
  const recentQs = opts.recent ? `?recent=${opts.recent}` : "";
  const url = `${opts.baseUrl ?? ""}${prefix}/${encodeURIComponent(vaultId)}/timeline${recentQs}`;
  const done = settleFetchMark("makerdao-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMakerTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MakerTimelineResult>;
  done(true);
  return fromTimelineWire<MakerTimelineResult>(json);
}
