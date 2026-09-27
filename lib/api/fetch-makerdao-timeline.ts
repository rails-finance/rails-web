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
import type { GroupedTimelineFields } from "@/lib/shared/timeline-folder";

/** The grouped answer: the flat result plus the interleaving plan and the two
 *  figures a cut in ROWS has to state. See lib/shared/timeline-folder.ts. */
export type MakerGroupedTimelineResult = MakerTimelineResult &
  GroupedTimelineFields & {
    /** The span `?from=`/`?to=` asked for, echoed in unix seconds. */
    span?: { from: number; to: number } | null;
  };

export interface FetchMakerTimelineOptions {
  baseUrl?: string;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** Ask for a WINDOW of the most recent N events instead of the whole history.
   *  The response says where the window opened (`cutoffBlock`); everything
   *  below that block is an opening balance the page fetches from the /summary
   *  twin. Omitted keeps the whole-history fetch. */
  recent?: number;
  /** A span of time in unix seconds, inclusive, in place of the newest window.
   *  Never given with `recent`: the index refuses the pair. */
  span?: [number, number];
}

function makerTimelineUrl(vaultId: string, baseUrl: string | undefined, qs: URLSearchParams): string {
  const q = qs.toString();
  return `${baseUrl ?? ""}/api/makerdao/vault/${encodeURIComponent(vaultId)}/timeline${q ? `?${q}` : ""}`;
}

export async function fetchMakerTimeline(
  vaultId: string,
  opts: FetchMakerTimelineOptions = {},
): Promise<MakerTimelineResult> {
  const qs = new URLSearchParams();
  if (opts.recent) qs.set("recent", String(opts.recent));
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const url = makerTimelineUrl(vaultId, opts.baseUrl, qs);
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

/**
 * The same history as ROWS (decision 0019's evening amendment): repetitive
 * stretches arrive as folders carrying their members' aggregate, ungrouped
 * events arrive as themselves, and the cut counts rows. A separate function
 * because it answers a different shape: `events` holds only the ungrouped
 * events. A `span` reads a month grouped the same way (decision 0019,
 * amendment 2026-09-25), echoed back as `span`.
 */
export async function fetchMakerGroupedTimeline(
  vaultId: string,
  opts: { baseUrl?: string; signal?: AbortSignal; headers?: HeadersInit; span?: [number, number] } = {},
): Promise<MakerGroupedTimelineResult> {
  const qs = new URLSearchParams({ group: "1" });
  if (opts.span) {
    qs.set("from", String(opts.span[0]));
    qs.set("to", String(opts.span[1]));
  }
  const done = settleFetchMark("makerdao-timeline-grouped");
  const res = await fetch(makerTimelineUrl(vaultId, opts.baseUrl, qs), {
    cache: "no-store",
    signal: opts.signal,
    headers: opts.headers,
  });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchMakerGroupedTimeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as WireTimeline<MakerGroupedTimelineResult>;
  done(true);
  return fromTimelineWire<MakerGroupedTimelineResult>(json);
}
