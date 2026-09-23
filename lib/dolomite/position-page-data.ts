// Dolomite's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape and the failure rules live in
// lib/shared/position-tail-page-data.ts.
//
// A Dolomite position is (owner, accountNumber) — the account number is a
// uint256, often hash-derived and past 2^53, so it travels as a decimal STRING
// and is never put through Number(). The route normalises it once, before this.
//
// The live per-account chain read stays a client-side second wave.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchDolomitePositions, type DolomitePositionsResult } from "@/lib/api/fetch-dolomite-positions";
import { fetchDolomiteTimeline } from "@/lib/api/fetch-dolomite-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadDolomitePositionTail = cache(async (owner: string, accountNumber: string) => {
  const tail = await loadPositionTail<DolomitePositionsResult>({
    label: "dolomite",
    readPositions: (baseUrl, headers) => fetchDolomitePositions({ owner, accountNumber, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchDolomiteTimeline(owner, accountNumber, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/dolomite/timeline/summary",
        params: { owner, accountNumber },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
