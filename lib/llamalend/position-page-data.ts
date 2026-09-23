// LlamaLend's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape and the failure rules live in
// lib/shared/position-tail-page-data.ts.
//
// A LlamaLend position is (controller, user): one market's own Controller
// contract, and the borrower in it. Both are addresses, normalised by the route
// before this.
//
// The live Controller read — the one that carries the soft-liquidation band —
// stays a client-side second wave.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchLlamalendPositions, type LlamalendPositionsResult } from "@/lib/api/fetch-llamalend-positions";
import { fetchLlamalendTimeline } from "@/lib/api/fetch-llamalend-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadLlamalendPositionTail = cache(async (controller: string, user: string) => {
  const tail = await loadPositionTail<LlamalendPositionsResult>({
    label: "llamalend",
    readPositions: (baseUrl, headers) => fetchLlamalendPositions({ controller, user, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchLlamalendTimeline(controller, user, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/llamalend/timeline/summary",
        params: { controller, user },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
