// ============================================================================
// FETCH POLARIS TIMELINE
// ============================================================================
//
// One CDP's whole history, keyed as the protocol keys it: (market, cdpId).
// The only arm is "api" — the LIVE rails-server index, which answers the
// whole history in one response (the deepest CDP on this testnet is a few
// hundred rows). A CDP the index has not captured answers 404 upstream, which
// this throws — the page keeps its index surfaces in their stated PENDING
// state and renders the chain overlay on its own.
//
// THE THROWN ERROR CARRIES THE STATUS, because 404 and 500 mean opposite
// things here. A 404 is the index answering: it has no rows for this
// (market, cdpId). A 500 is the index failing to answer at all. The server
// loader turns the first into a candidate "never minted" verdict and the
// second into the PENDING state, and it cannot tell them apart from an
// Error whose message is a sentence.

import type { PolarisTimelineResult } from "@/lib/sources/api/polaris-timeline";
import type { PolarisMarket } from "@/lib/polaris/asset-catalog";
import { settleFetchMark } from "@/lib/perf/settle-marks";
import { fromTimelineWire, type WireTimeline } from "@/lib/shared/timeline-wire";

/** A timeline read that reached the index and came back not-ok. `status` is
 *  the HTTP status the proxy passed through from rails-server. */
export class PolarisTimelineHttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string) {
    super(`fetchPolarisTimeline failed: ${status} ${statusText}`);
    this.name = "PolarisTimelineHttpError";
    this.status = status;
  }
}

export async function fetchPolarisTimeline(
  market: PolarisMarket,
  cdpId: string,
  opts: { baseUrl?: string; headers?: HeadersInit } = {},
): Promise<PolarisTimelineResult> {
  const qs = new URLSearchParams({ market, id: cdpId });
  const url = `${opts.baseUrl ?? ""}/api/polaris/timeline?${qs.toString()}`;
  const done = settleFetchMark("polaris-timeline");
  const res = await fetch(url, { cache: "no-store", headers: opts.headers });
  if (!res.ok) {
    done(false);
    throw new PolarisTimelineHttpError(res.status, res.statusText);
  }
  const json = (await res.json()) as WireTimeline<PolarisTimelineResult>;
  done(true);
  return fromTimelineWire<PolarisTimelineResult>(json);
}
