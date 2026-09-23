// SparkLend's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchSparkPositions } from "@/lib/api/fetch-spark-positions";
import {
  fetchSparkTimeline,
  fetchSparkGroupedTimeline,
  type SparkGroupedTimelineResult,
} from "@/lib/api/fetch-spark-timeline";
import type { SparkTimelineResult } from "@/lib/sources/api/spark-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { SparkPositionSummary } from "@/lib/sources/api/spark-positions";

/**
 * ONE timeline read, whichever shape the URL asked for — the Aave V3 twin's own
 * rule, and `lib/aave-v3/position-page-data.ts` carries the argument in full:
 * the grouped answer REPLACES the flat window rather than arriving beside it,
 * and `grouped` is a boolean rather than an options object because `cache()`
 * keys on argument identity.
 *
 * `grouped` defaults to FALSE while a page load defaults to TRUE, and the two
 * are not in disagreement: the callers that omit it are the opengraph images,
 * which name ONE event and need it findable by id — a grouped answer carries
 * only the ungrouped events, so a card for an event inside a folder would fall
 * back to generic text. A page passes the URL's own answer explicitly.
 */
export const loadSparkPositionTail = cache(async (wallet: string, grouped: boolean = false) => {
  const tail = await loadPositionTail<
    { data: SparkPositionSummary[] },
    SparkTimelineResult | SparkGroupedTimelineResult
  >({
    label: "spark",
    readPositions: (baseUrl, headers) => fetchSparkPositions({ wallet, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      grouped
        ? fetchSparkGroupedTimeline(wallet, { baseUrl, headers })
        : fetchSparkTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/spark/timeline/summary",
        params: { wallet },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    // The flag alone does not prove a grouped answer arrived — a backend that
    // predates the grouping answers the flat shape.
    grouped: tail.timeline && "grouped" in tail.timeline ? tail.timeline : null,
  };
});
