// Compound V2's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// The live Comptroller read stays a client-side second wave: the risk surfaces
// it feeds simply stay unrendered when it fails, which is not a reason to make
// the document wait for a chain round trip.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/compound-v2/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import type { CompoundV2PositionsResult } from "@/lib/api/fetch-compound-v2-positions";
import type { CompoundV2GroupedTimelineResult } from "@/lib/api/fetch-compound-v2-timeline";
import type { CompoundV2TimelineResult } from "@/lib/sources/api/compound-v2-timeline";
import {
  readCompoundV2OpeningBalance,
  readCompoundV2Positions,
  readCompoundV2Timeline,
} from "@/lib/compound-v2/proxy-reads";
import type { TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

/**
 * ONE timeline read, whichever shape the URL asked for — the SparkLend and
 * Aave V3 loaders' rule: the grouped answer REPLACES the flat window, and
 * `grouped` is a boolean because `cache()` keys on argument identity. It
 * defaults to FALSE for the callers that omit it, the opengraph images and the
 * event page, which name ONE event and need it findable by id; a grouped
 * answer carries only the ungrouped events. The page passes the URL's answer.
 */
export const loadCompoundV2PositionTail = cache(async (wallet: string, grouped: boolean = false) => {
  const tail = await loadPositionTail<
    CompoundV2PositionsResult,
    CompoundV2TimelineResult | CompoundV2GroupedTimelineResult
  >({
    label: "compound-v2",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope(
        await readCompoundV2Positions(new URLSearchParams({ wallet, limit: "1" }), { baseUrl, headers }),
        "readCompoundV2Positions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<CompoundV2TimelineResult | CompoundV2GroupedTimelineResult>(
        await readCompoundV2Timeline(
          new URLSearchParams(grouped ? { wallet, group: "1" } : { wallet, recent: String(TIMELINE_WINDOW_EVENTS) }),
          { baseUrl, headers },
        ),
        "readCompoundV2Timeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readCompoundV2OpeningBalance(new URLSearchParams({ wallet, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readCompoundV2OpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    // The flag alone does not prove a grouped answer arrived.
    grouped: tail.timeline && "grouped" in tail.timeline ? tail.timeline : null,
  };
});
