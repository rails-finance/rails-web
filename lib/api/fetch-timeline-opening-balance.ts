// Fetch the opening balance for a windowed timeline.
// ----------------------------------------------------------------------------
// One fetcher for every protocol: the `/timeline/summary` proxy routes differ
// only in which position parameters they take and which resolver they run their
// asset keys through, and both of those are settled before this is called. What
// arrives is already in the page's vocabulary — see
// lib/shared/timeline-opening-balance-wire.ts.
//
// This is the SECOND of the two requests a windowed page makes, and it is
// deliberately not merged into the first. The rows land and the list is
// readable while this is still in flight; every whole-history figure waits,
// declared as waiting, and resolves when it arrives. The alternative — one
// request that composes both server-side — would be marginally faster on the
// handful of positions deep enough to need a window at all, and it would make
// the whole page wait on the slower half.

import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { settleFetchMark } from "@/lib/perf/settle-marks";

export interface FetchOpeningBalanceParams {
  /** The proxy route, e.g. `/api/aave-v3/timeline/summary`. */
  path: string;
  /** The position's own parameters — whatever that route validates. */
  params: Record<string, string | undefined>;
  /** The block the window opened at, from the rows response. The opening
   *  balance covers `block_number <` THIS, and the rows cover `>=` it; passing
   *  anything else here puts a gap or an overlap between the two halves. */
  cutoffBlock: number;
  baseUrl?: string;
  signal?: AbortSignal;
  /** The signed reader headers a server render's hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchTimelineOpeningBalance(p: FetchOpeningBalanceParams): Promise<TimelineOpeningBalance> {
  const qs = new URLSearchParams({ cutoffBlock: String(p.cutoffBlock) });
  for (const [k, v] of Object.entries(p.params)) if (v) qs.set(k, v);
  const url = `${p.baseUrl ?? ""}${p.path}?${qs.toString()}`;
  const done = settleFetchMark("timeline-opening-balance");
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchTimelineOpeningBalance failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as TimelineOpeningBalance;
  done(true);
  return json;
}
