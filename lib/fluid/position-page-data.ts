// Fluid's position tail, read server-side. SERVER-ONLY — imported only from the
// position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// A Fluid position is an NFT, not a wallet: the id in the URL names one vault
// position directly, so the roster read is 0-or-1 row by construction.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchFluidPositions, type FluidPositionsResult } from "@/lib/api/fetch-fluid-positions";
import { fetchFluidTimeline } from "@/lib/api/fetch-fluid-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadFluidPositionTail = cache(async (nftId: string) => {
  const tail = await loadPositionTail<FluidPositionsResult>({
    label: "fluid",
    readPositions: (baseUrl, headers) => fetchFluidPositions({ nft: nftId, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) => fetchFluidTimeline(nftId, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/fluid/timeline/summary",
        params: { nft: nftId },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
