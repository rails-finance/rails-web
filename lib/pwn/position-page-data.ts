// PWN's position tail, read server-side. SERVER-ONLY — imported only from the
// position page's server component. The shape, the failure rules and why the
// windowed history's opening balance is read here live in
// lib/shared/position-tail-page-data.ts.
//
// Every loan the wallet is a party to is read (not limit:1), because `?loan=`
// can resolve to any of them and the timeline carries all their events.
//
// THE WINDOW IS CUT AT THE WALLET; THE PAGE RENDERS ONE LOAN. rails-server keys
// `?recent=N` and its /summary twin on the wallet, so on a wallet party to more
// than one loan the window's figures describe a different position than the rows
// beneath them. The client half answers that by refetching the whole history —
// two chained reads whose need is only known after both of the first two land.
// Rather than teach the shared loader that shape for one caller, this seeds only
// the case where the two grains coincide and hands the client an unseeded page
// otherwise, which is exactly the page it renders today. PWN's deepest wallet in
// the index holds 77 events against a 1,000-event window, so no wallet takes
// that branch today.
//
// The three reads go to the BOX and run the proxy routes' shaping here, in the
// render (lib/pwn/proxy-reads.ts), in place of a fetch of each route.

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { TIMELINE_WINDOW_EVENTS, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import { boxOnlyHop } from "@/lib/shared/listing-ssr";
import { answerBody, answerEnvelope, answerTimeline } from "@/lib/shared/proxy-answer";
import { readPwnOpeningBalance, readPwnPositions, readPwnTimeline } from "@/lib/pwn/proxy-reads";
import type { FetchPwnTimelineResult } from "@/lib/api/fetch-pwn-timeline";
import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";

const EMPTY = {
  summaries: null,
  events: null,
  cutoffBlock: null,
  opening: null,
};

export const loadPwnPositionTail = cache(async (wallet: string) => {
  const tail = await loadPositionTail<{ data: PwnPositionSummary[] }>({
    label: "pwn",
    readPositions: async (baseUrl, headers) =>
      answerEnvelope<{ data: PwnPositionSummary[] }["data"][number]>(
        await readPwnPositions(new URLSearchParams({ wallet, limit: "100" }), { baseUrl, headers }),
        "readPwnPositions",
        100,
      ),
    readTimeline: async (baseUrl, headers) =>
      answerTimeline<FetchPwnTimelineResult>(
        await readPwnTimeline(new URLSearchParams({ wallet, recent: String(TIMELINE_WINDOW_EVENTS) }), {
          baseUrl,
          headers,
        }),
        "readPwnTimeline",
      ),
    readOpening: async (baseUrl, cutoffBlock, headers) =>
      answerBody(
        await readPwnOpeningBalance(new URLSearchParams({ wallet, cutoffBlock: String(cutoffBlock) }), {
          baseUrl,
          headers,
        }),
        "readPwnOpeningBalance",
      ) as TimelineOpeningBalance,
    hop: boxOnlyHop,
  });
  const summaries = tail.positions?.data ?? null;
  // The refusal above. Windowed AND multi-loan means the seeded figures would be
  // about a different position than the rows, so nothing is seeded.
  if (tail.cutoffBlock != null && summaries != null && summaries.length !== 1) return EMPTY;
  return { ...tail, summaries };
});
