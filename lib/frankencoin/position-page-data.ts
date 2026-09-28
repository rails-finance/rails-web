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
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/frankencoin/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import {
  readFrankencoinOpeningBalance,
  readFrankencoinPositions,
  readFrankencoinTimeline,
} from "@/lib/frankencoin/proxy-reads";
import type { FrankencoinPositionsResult } from "@/lib/api/fetch-frankencoin-positions";
import type { FrankencoinTimelineResult } from "@/lib/sources/api/frankencoin-timeline";

export const loadFrankencoinPositionTail = cache(async (position: string) => {
  const tail = await loadPositionTail<FrankencoinPositionsResult>({
    label: "frankencoin",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<FrankencoinPositionsResult["data"][number]>(
        await readFrankencoinPositions(new URLSearchParams({ position, limit: "1" }), { baseUrl, headers }),
        "readFrankencoinPositions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<FrankencoinTimelineResult>(
        await readFrankencoinTimeline(new URLSearchParams({ position, recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readFrankencoinTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readFrankencoinOpeningBalance(new URLSearchParams({ position, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readFrankencoinOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
