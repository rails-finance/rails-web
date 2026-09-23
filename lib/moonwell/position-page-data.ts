// Moonwell's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// This is the Ethereum deployment. Its Base sibling has no index that can vouch
// for a whole life yet, so that page seeds the Comptroller read instead and
// sweeps the history in the browser (lib/moonwell-base/position-page-data.ts).

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchMoonwellPositions, type MoonwellPositionsResult } from "@/lib/api/fetch-moonwell-positions";
import { fetchMoonwellTimeline } from "@/lib/api/fetch-moonwell-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadMoonwellPositionTail = cache(async (wallet: string) => {
  const tail = await loadPositionTail<MoonwellPositionsResult>({
    label: "moonwell",
    readPositions: (baseUrl, headers) => fetchMoonwellPositions({ wallet, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchMoonwellTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/moonwell/timeline/summary",
        params: { wallet },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
