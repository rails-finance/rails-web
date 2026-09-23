// Morpho Blue's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// The singleton's own slot read at head stays a client-side second wave.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchMorphoPositions, type MorphoPositionsResult } from "@/lib/api/fetch-morpho-positions";
import { fetchMorphoTimeline } from "@/lib/api/fetch-morpho-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import { splitMorphoPositionId } from "@/lib/morpho/position-id";

export const loadMorphoPositionTail = cache(async (positionId: string) => {
  const { market, user } = splitMorphoPositionId(positionId);
  const tail = await loadPositionTail<MorphoPositionsResult>({
    label: "morpho",
    readPositions: (baseUrl, headers) => fetchMorphoPositions({ market, user, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchMorphoTimeline(positionId, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/morpho/timeline/summary",
        params: { positionId },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
