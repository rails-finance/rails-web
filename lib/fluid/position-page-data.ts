// Fluid's position tail, read server-side. SERVER-ONLY — imported only from the
// position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// A Fluid position is an NFT, not a wallet: the id in the URL names one vault
// position directly, so the roster read is 0-or-1 row by construction.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/fluid/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import { readFluidOpeningBalance, readFluidPositions, readFluidTimeline } from "@/lib/fluid/proxy-reads";
import type { FluidPositionsResult } from "@/lib/api/fetch-fluid-positions";
import type { FluidTimelineResponse } from "@/lib/api/fetch-fluid-timeline";

export const loadFluidPositionTail = cache(async (nftId: string) => {
  const tail = await loadPositionTail<FluidPositionsResult>({
    label: "fluid",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<FluidPositionsResult["data"][number]>(
        await readFluidPositions(new URLSearchParams({ nft: nftId, limit: "1" }), { baseUrl, headers }),
        "readFluidPositions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<FluidTimelineResponse>(
        await readFluidTimeline(new URLSearchParams({ nft: nftId, recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readFluidTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readFluidOpeningBalance(new URLSearchParams({ nft: nftId, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readFluidOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
