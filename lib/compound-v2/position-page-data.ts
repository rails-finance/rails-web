// Compound V2's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// The live Comptroller read stays a client-side second wave: the risk surfaces
// it feeds simply stay unrendered when it fails, which is not a reason to make
// the document wait for a chain round trip.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchCompoundV2Positions, type CompoundV2PositionsResult } from "@/lib/api/fetch-compound-v2-positions";
import { fetchCompoundV2Timeline } from "@/lib/api/fetch-compound-v2-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadCompoundV2PositionTail = cache(async (wallet: string) => {
  const tail = await loadPositionTail<CompoundV2PositionsResult>({
    label: "compound-v2",
    readPositions: (baseUrl, headers) => fetchCompoundV2Positions({ wallet, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchCompoundV2Timeline(wallet, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/compound-v2/timeline/summary",
        params: { wallet },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
