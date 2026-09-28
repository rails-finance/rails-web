// Liquity V1's position tail, read server-side. SERVER-ONLY — imported only from
// the position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// Every lifecycle for the wallet is read (not limit:1) — a reopened Trove has one
// summary per (wallet, epoch), and `?epoch=` can resolve to any of them.
//
// THE WINDOW IS CUT AT THE WALLET; THE PAGE RENDERS ONE TROVE LIFE. rails-server
// keys `?recent=N` and its /summary twin on the wallet, so on a wallet with more
// than one life the window's figures describe a different position than the rows
// beneath them. The client half answers that by refetching the whole history —
// two chained reads whose need is only known after both of the first two land.
// Rather than teach the shared loader that shape for one caller, this seeds only
// the case where the two grains coincide and hands the client an unseeded page
// otherwise, which is exactly the page it renders today. Of the 9,348 lives in
// the index exactly one exceeds the 1,000-event window, and by 19 events —
// Liquity V1 is immutable, so its depth ceiling rises on its own and that count
// is worth re-measuring, at the LIFE grain, before the conclusion is reused.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/liquity-v1/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import {
  readLiquityV1OpeningBalance,
  readLiquityV1Positions,
  readLiquityV1Timeline,
} from "@/lib/liquity-v1/proxy-reads";
import type { LiquityV1TimelineResult } from "@/lib/sources/api/liquity-v1-timeline";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";

const EMPTY = {
  summaries: null,
  events: null,
  cutoffBlock: null,
  opening: null,
};

export const loadLiquityV1PositionTail = cache(async (wallet: string) => {
  const tail = await loadPositionTail<{ data: LiquityV1PositionSummary[] }>({
    label: "liquity-v1",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<{ data: LiquityV1PositionSummary[] }["data"][number]>(
        await readLiquityV1Positions(new URLSearchParams({ wallet, limit: "100" }), { baseUrl, headers }),
        "readLiquityV1Positions",
        100,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<LiquityV1TimelineResult>(
        await readLiquityV1Timeline(new URLSearchParams({ wallet, recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readLiquityV1Timeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readLiquityV1OpeningBalance(new URLSearchParams({ wallet, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readLiquityV1OpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  const summaries = tail.positions?.data ?? null;
  // The refusal above. Windowed AND multi-life means the seeded figures would be
  // about a different position than the rows, so nothing is seeded.
  if (tail.cutoffBlock != null && summaries != null && summaries.length !== 1) return EMPTY;
  return { ...tail, summaries };
});
