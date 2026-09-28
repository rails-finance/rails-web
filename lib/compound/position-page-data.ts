// Compound V3's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape, the failure rules and
// why the windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// A Comet account is per (wallet, market) — each market is its own contract with
// its own base asset — so the market is part of this cache key, not an
// afterthought, and both reads are scoped to it.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/compound/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerTimeline } from "@/lib/shared/proxy-answer";
import { readCompoundPositions } from "@/lib/api/compound-positions-proxy";
import {
  COMPOUND_ETHEREUM_POSITIONS,
  readCompoundOpeningBalance,
  readCompoundTimeline,
} from "@/lib/compound/proxy-reads";
import type { CompoundPositionsResult } from "@/lib/api/fetch-compound-positions";
import type { CompoundGroupedTimelineResult } from "@/lib/api/fetch-compound-timeline";
import type { CompoundTimelineResult } from "@/lib/sources/api/compound-timeline";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

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
    readPositions: async (baseUrl, headers) => {
      const json = answerBody(
        await readCompoundPositions(
          new URLSearchParams({ market, wallet, limit: "1" }),
          { baseUrl, headers },
          COMPOUND_ETHEREUM_POSITIONS,
        ),
        "readCompoundPositions",
      ) as Partial<CompoundPositionsResult>;
      return {
        data: json.data ?? [],
        pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: 1, offset: 0 },
        coverage: json.coverage,
      };
    },
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<CompoundTimelineResult | CompoundGroupedTimelineResult>(
        await readCompoundTimeline(
          new URLSearchParams(
            grouped ? { wallet, market, group: "1" } : { wallet, market, recent: String(TIMELINE_WINDOW_EVENTS) },
          ),
          { baseUrl, headers },
        ),
        "readCompoundTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readCompoundOpeningBalance(new URLSearchParams({ wallet, market, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readCompoundOpeningBalance",
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
