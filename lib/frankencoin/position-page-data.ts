// Frankencoin's position tail, read server-side. SERVER-ONLY — imported only
// from the position page's server component. The shape and the failure rules
// live in lib/shared/position-tail-page-data.ts.
//
// This page has two independent lanes and only one of them is here. The CHAIN
// lane — the position's own slots at head — is the page's primary truth and
// stays a client-side read; the INDEX lane carries the history and the facts
// head state cannot say (a DENIED verdict, the challenge tallies), and it is the
// tail this loader seeds.
//
// Those lanes are deliberately independent, so seeding one does not change what
// the other says. A failed index read leaves its surfaces in their explicit
// PENDING state — the loader returning nothing puts the client back exactly
// where it was, which is the state the page already knows how to render.
//
import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchFrankencoinPositions, type FrankencoinPositionsResult } from "@/lib/api/fetch-frankencoin-positions";
import { fetchFrankencoinTimeline } from "@/lib/api/fetch-frankencoin-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";

export const loadFrankencoinPositionTail = cache(async (position: string) => {
  const tail = await loadPositionTail<FrankencoinPositionsResult>({
    label: "frankencoin",
    readPositions: (baseUrl, headers) => fetchFrankencoinPositions({ position, limit: 1, baseUrl, headers }),
    readTimeline: (baseUrl, headers) =>
      fetchFrankencoinTimeline(position, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/frankencoin/timeline/summary",
        params: { position },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
