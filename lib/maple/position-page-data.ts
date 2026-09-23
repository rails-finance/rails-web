// Maple's position tail, read server-side. SERVER-ONLY — imported only from the
// position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// Maple's positions envelope carries `poolState` beside the row — the per-pool
// exit/NAV rates and the liquid/deployed split, one multicall the listing proxy
// already takes. The card's redeemable value and the pool band both read it, so
// it is part of the seed, not a second wave.
//
// The CCIP bridge escrows are not lenders: the backend returns no roster row and
// no timeline for them, and the page renders a custody view off its own chain
// read. Nothing here is fetched for those addresses — the page decides that
// before calling, the same way it always did.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchMaplePositions, type MaplePositionsResult } from "@/lib/api/fetch-maple-positions";
import { fetchMapleTimeline } from "@/lib/api/fetch-maple-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadMaplePositionTail = cache(async (wallet: string) => {
  const tail = await loadPositionTail<MaplePositionsResult>({
    label: "maple",
    readPositions: (baseUrl, headers) => fetchMaplePositions({ wallet, limit: 1, status: undefined, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchMapleTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/maple/timeline/summary",
        params: { wallet },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return {
    ...tail,
    position: tail.positions?.data[0] ?? null,
    poolState: tail.positions?.poolState ?? null,
  };
});
