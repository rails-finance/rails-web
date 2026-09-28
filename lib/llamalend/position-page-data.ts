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
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/llamalend/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import {
  readLlamalendOpeningBalance,
  readLlamalendPositions,
  readLlamalendTimeline,
} from "@/lib/llamalend/proxy-reads";
import type { LlamalendPositionsResult } from "@/lib/api/fetch-llamalend-positions";
import type { LlamalendTimelineResult } from "@/lib/sources/api/llamalend-timeline";

export const loadLlamalendPositionTail = cache(async (controller: string, user: string) => {
  const tail = await loadPositionTail<LlamalendPositionsResult>({
    label: "llamalend",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<LlamalendPositionsResult["data"][number]>(
        await readLlamalendPositions(new URLSearchParams({ user, controller, limit: "1" }), { baseUrl, headers }),
        "readLlamalendPositions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<LlamalendTimelineResult>(
        await readLlamalendTimeline(new URLSearchParams({ controller, user, recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readLlamalendTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readLlamalendOpeningBalance(new URLSearchParams({ controller, user, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readLlamalendOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
