// Compound V3's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape, the failure rules and
// why the windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// A Comet account is per (wallet, market) — each market is its own contract with
// its own base asset — so the market is part of this cache key, not an
// afterthought, and both reads are scoped to it.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchCompoundPositions, type CompoundPositionsResult } from "@/lib/api/fetch-compound-positions";
import {
  fetchCompoundTimeline,
  fetchCompoundGroupedTimeline,
  type CompoundGroupedTimelineResult,
} from "@/lib/api/fetch-compound-timeline";
import type { CompoundTimelineResult } from "@/lib/sources/api/compound-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

/**
 * ONE timeline read, whichever shape the URL asked for — the SparkLend and
 * Aave V3 loaders' rule: the grouped answer REPLACES the flat window, and
 * `grouped` is a boolean because `cache()` keys on argument identity. It
 * defaults to FALSE for the callers that omit it, the opengraph images and the
 * event page, which name ONE event and need it findable by id; a grouped
 * answer carries only the ungrouped events. The page passes the URL's answer.
 */
export const loadCompoundPositionTail = cache(async (wallet: string, market: string, grouped: boolean = false) => {
  const tail = await loadPositionTail<CompoundPositionsResult, CompoundTimelineResult | CompoundGroupedTimelineResult>({
    label: "compound-v3",
    readPositions: (baseUrl, headers) => fetchCompoundPositions({ wallet, market, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      grouped
        ? fetchCompoundGroupedTimeline(wallet, market, { baseUrl, headers })
        : fetchCompoundTimeline(wallet, { market, recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/compound/timeline/summary",
        params: { wallet, market },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    // The flag alone does not prove a grouped answer arrived.
    grouped: tail.timeline && "grouped" in tail.timeline ? tail.timeline : null,
  };
});
