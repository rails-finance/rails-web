// Maple's position tail, read server-side. SERVER-ONLY — imported only from the
// position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// Maple's positions envelope carries `poolState` beside the row — the per-pool
// exit/NAV rates and the liquid/deployed split, one multicall the listing proxy
// already takes. The card's redeemable value and the pool band both read it, so
// it is part of the seed, not a second wave.
//
// The CCIP bridge escrows are not lenders: the backend returns no roster row and
// no timeline for them, and the page renders a custody view off its own chain
// read. Nothing here is fetched for those addresses — the page decides that
// before calling, the same way it always did.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchMaplePositions, type MaplePositionsResult } from "@/lib/api/fetch-maple-positions";
import {
  fetchMapleTimeline,
  fetchMapleGroupedTimeline,
  type MapleGroupedTimelineResult,
  type MapleTimelineResponse,
} from "@/lib/api/fetch-maple-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

/**
 * ONE timeline read, whichever shape the URL asked for — the SparkLend and
 * Aave V3 loaders' rule: the grouped answer REPLACES the flat window, and
 * `grouped` is a boolean because `cache()` keys on argument identity. It
 * defaults to FALSE for the callers that omit it, the opengraph images and the
 * event page's metadata, which name ONE event and need it findable by id; a
 * grouped answer carries only the ungrouped events. The page passes the URL's
 * answer.
 */
export const loadMaplePositionTail = cache(async (wallet: string, grouped: boolean = false) => {
  const tail = await loadPositionTail<MaplePositionsResult, MapleTimelineResponse | MapleGroupedTimelineResult>({
    label: "maple",
    readPositions: (baseUrl, headers) => fetchMaplePositions({ wallet, limit: 1, status: undefined, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      grouped
        ? fetchMapleGroupedTimeline(wallet, { baseUrl, headers })
        : fetchMapleTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/maple/timeline/summary",
        params: { wallet },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    poolState: tail.positions?.poolState ?? null,
    // The flag alone does not prove a grouped answer arrived.
    grouped: tail.timeline && "grouped" in tail.timeline ? (tail.timeline as MapleGroupedTimelineResult) : null,
  };
});
