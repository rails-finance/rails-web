// Aave V3's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// V3 is one cross-collateralised account per (wallet, market), and the market is
// a query parameter — so it is part of this cache key, not an afterthought.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/aave-v3/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerTimeline } from "@/lib/shared/proxy-answer";
import { readAaveV3OpeningBalance, readAaveV3Positions, readAaveV3Timeline } from "@/lib/aave-v3/proxy-reads";
import type { AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import type { AaveV3TimelineResponse, AaveV3GroupedTimelineResponse } from "@/lib/api/fetch-aave-v3-timeline";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import type { AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";

/**
 * ONE timeline read, whichever shape the URL asked for.
 *
 * The same history as ROWS (decision `0019`; the default, `?folders=0` opts out) — the
 * grouped answer is a REPLACEMENT for the flat window, never an addition to it:
 * it carries the ungrouped events, the row plan that puts the folders back
 * between them, and — since leg B — each folder's own flows, actor split and
 * day histogram, which is everything the page's whole-history reductions read.
 * So the grouped read is made HERE, in place of the flat one, rather than
 * client-side beside it, and the document the reader gets is server-rendered
 * either way.
 *
 * ⚠️ `grouped` is a BOOLEAN and not an options object, because `cache()` keys
 * on argument identity: an object literal would be a fresh key on every call
 * and the page, its metadata and its share card would each make the whole read
 * again. Every call site within one request must pass the same value.
 *
 * ⚠️ It defaults to FALSE while a page load defaults to TRUE, and the two are
 * not in disagreement: the callers that omit it are the opengraph images, which
 * name ONE event and need it findable by id — a grouped answer carries only the
 * ungrouped events, so a card for an event inside a folder would fall back to
 * generic text. A page passes the URL's own answer explicitly.
 */
export const loadAaveV3PositionTail = cache(
  async (wallet: string, market: AaveV3MarketKey, grouped: boolean = false) => {
    const tail = await loadPositionTail<
      { rows: AaveV3PositionRow[] },
      AaveV3TimelineResponse | AaveV3GroupedTimelineResponse
    >({
      label: "aave-v3",
      readPositions: async (baseUrl, headers) =>
        answerBody(
          await readAaveV3Positions(new URLSearchParams({ wallet, market, limit: "1" }), { baseUrl, headers }),
          "readAaveV3Positions",
        ) as { rows: AaveV3PositionRow[] },
      readTimeline: async (baseUrl, headers) =>
        answerTimeline<AaveV3TimelineResponse | AaveV3GroupedTimelineResponse>(
          await readAaveV3Timeline(
            new URLSearchParams(
              grouped ? { wallet, market, group: "1" } : { wallet, market, recent: String(TIMELINE_WINDOW_EVENTS) },
            ),
            { baseUrl, headers },
          ),
          "readAaveV3Timeline",
        ),
      readOpening: async (baseUrl, cutoffBlock, headers) =>
        answerBody(
          await readAaveV3OpeningBalance(new URLSearchParams({ wallet, market, cutoffBlock: String(cutoffBlock) }), {
            baseUrl,
            headers,
          }),
          "readAaveV3OpeningBalance",
        ) as TimelineOpeningBalance,
      hop: boxOnlyHop,
    });
    return {
      ...tail,
      position: tail.positions?.rows[0] ?? null,
      // Only a GROUPED read carries a row plan, and the flag alone does not
      // prove one arrived — a backend that predates the grouping answers the
      // flat shape, which this narrowing refuses rather than half-reads.
      grouped: tail.timeline && "grouped" in tail.timeline ? tail.timeline : null,
    };
  },
);
