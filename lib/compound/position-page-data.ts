// Compound V3's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape, the failure rules and
// why the windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// A Comet account is per (wallet, market) — each market is its own contract with
// its own base asset — so the market is part of this cache key, not an
// afterthought, and both reads are scoped to it.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchCompoundPositions, type CompoundPositionsResult } from "@/lib/api/fetch-compound-positions";
import { fetchCompoundTimeline } from "@/lib/api/fetch-compound-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadCompoundPositionTail = cache(async (wallet: string, market: string) => {
  const tail = await loadPositionTail<CompoundPositionsResult>({
    label: "compound-v3",
    readPositions: (baseUrl, headers) => fetchCompoundPositions({ wallet, market, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchCompoundTimeline(wallet, { market, recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/compound/timeline/summary",
        params: { wallet, market },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
