// Dolomite's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape and the failure rules live in
// lib/shared/position-tail-page-data.ts.
//
// A Dolomite position is (owner, accountNumber) — the account number is a
// uint256, often hash-derived and past 2^53, so it travels as a decimal STRING
// and is never put through Number(). The route normalises it once, before this.
//
// The live per-account chain read stays a client-side second wave.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/dolomite/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import { readDolomiteOpeningBalance, readDolomitePositions, readDolomiteTimeline } from "@/lib/dolomite/proxy-reads";
import type { DolomitePositionsResult } from "@/lib/api/fetch-dolomite-positions";
import type { DolomiteTimelineResult } from "@/lib/sources/api/dolomite-timeline";

export const loadDolomitePositionTail = cache(async (owner: string, accountNumber: string) => {
  const tail = await loadPositionTail<DolomitePositionsResult>({
    label: "dolomite",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<DolomitePositionsResult["data"][number]>(
        await readDolomitePositions(new URLSearchParams({ owner, accountNumber, limit: "1" }), { baseUrl, headers }),
        "readDolomitePositions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<DolomiteTimelineResult>(
        await readDolomiteTimeline(
          new URLSearchParams({ owner, accountNumber, recent: String(TIMELINE_WINDOW_EVENTS) }),
          { baseUrl, headers },
        ),
        "readDolomiteTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readDolomiteOpeningBalance(
          new URLSearchParams({ owner, accountNumber, cutoffBlock: String(cutoffBlock) }),
          { baseUrl, headers },
        ),
        "readDolomiteOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
