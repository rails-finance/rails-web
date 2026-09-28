// Moonwell's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// This is the Ethereum deployment. Its Base sibling has no index that can vouch
// for a whole life yet, so that page seeds the Comptroller read instead and
// sweeps the history in the browser (lib/moonwell-base/position-page-data.ts).
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/moonwell/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import { readMoonwellOpeningBalance, readMoonwellPositions, readMoonwellTimeline } from "@/lib/moonwell/proxy-reads";
import type { MoonwellPositionsResult } from "@/lib/api/fetch-moonwell-positions";
import type { MoonwellTimelineResult } from "@/lib/sources/api/moonwell-timeline";

export const loadMoonwellPositionTail = cache(async (wallet: string) => {
  const tail = await loadPositionTail<MoonwellPositionsResult>({
    label: "moonwell",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<MoonwellPositionsResult["data"][number]>(
        await readMoonwellPositions(new URLSearchParams({ wallet, limit: "1" }), { baseUrl, headers }),
        "readMoonwellPositions",
        1,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<MoonwellTimelineResult>(
        await readMoonwellTimeline(new URLSearchParams({ wallet, recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readMoonwellTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readMoonwellOpeningBalance(new URLSearchParams({ wallet, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readMoonwellOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  return { ...tail, position: tail.positions?.data[0] ?? null };
});
