// Morpho Blue's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// The singleton's slot read at head stays a client-side second wave.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/morpho/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import { readMorphoOpeningBalance, readMorphoPositions, readMorphoTimeline } from "@/lib/morpho/proxy-reads";
import type { MorphoPositionsResult } from "@/lib/api/fetch-morpho-positions";
import type { MorphoGroupedTimelineResult } from "@/lib/api/fetch-morpho-timeline";
import type { MorphoTimelineResult } from "@/lib/sources/api/morpho-timeline";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
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
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<MorphoPositionsResult["data"][number]>(
        await readMorphoPositions(new URLSearchParams({ market, user, limit: "1" }), { baseUrl, headers }),
        "readMorphoPositions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<MorphoTimelineResult | MorphoGroupedTimelineResult>(
        await readMorphoTimeline(
          positionId,
          new URLSearchParams(grouped ? { group: "1" } : { recent: String(TIMELINE_WINDOW_EVENTS) }),
          { baseUrl, headers },
        ),
        "readMorphoTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readMorphoOpeningBalance(new URLSearchParams({ positionId, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readMorphoOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    // The flag alone does not prove a grouped answer arrived.
    grouped: tail.timeline && "grouped" in tail.timeline ? (tail.timeline as MorphoGroupedTimelineResult) : null,
  };
});
