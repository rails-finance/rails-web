// Morpho Blue's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// The singleton's own slot read at head stays a client-side second wave.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchMorphoPositions, type MorphoPositionsResult } from "@/lib/api/fetch-morpho-positions";
import {
  fetchMorphoTimeline,
  fetchMorphoGroupedTimeline,
  type MorphoGroupedTimelineResult,
} from "@/lib/api/fetch-morpho-timeline";
import type { MorphoTimelineResult } from "@/lib/sources/api/morpho-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";

/**
 * ONE timeline read, whichever shape the URL asked for — the SparkLend and
 * Aave V3 loaders' rule: the grouped answer REPLACES the flat window, and
 * `grouped` is a boolean because `cache()` keys on argument identity. It
 * defaults to FALSE for the callers that omit it, the opengraph images and the
 * event page's metadata, which name ONE event and need it findable by id; a
 * grouped answer carries only the ungrouped events. The page passes the URL's
 * answer.
 */
export const loadMorphoPositionTail = cache(async (positionId: string, grouped: boolean = false) => {
  const { market, user } = splitMorphoPositionId(positionId);
  const tail = await loadPositionTail<MorphoPositionsResult, MorphoTimelineResult | MorphoGroupedTimelineResult>({
    label: "morpho",
    readPositions: (baseUrl, headers) => fetchMorphoPositions({ market, user, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      grouped
        ? fetchMorphoGroupedTimeline(positionId, { baseUrl, headers })
        : fetchMorphoTimeline(positionId, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/morpho/timeline/summary",
        params: { positionId },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    // The flag alone does not prove a grouped answer arrived.
    grouped: tail.timeline && "grouped" in tail.timeline ? (tail.timeline as MorphoGroupedTimelineResult) : null,
  };
});
