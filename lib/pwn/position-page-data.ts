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

import { cache } from "react";
import { loadPositionTail } from "@/lib/shared/position-tail-page-data";
import { fetchPwnPositions } from "@/lib/api/fetch-pwn-positions";
import { fetchPwnTimeline } from "@/lib/api/fetch-pwn-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
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
    readPositions: (baseUrl, headers) => fetchPwnPositions({ wallet, limit: 100, baseUrl, headers }),
    readTimeline: (baseUrl, headers) => fetchPwnTimeline(wallet, { recent: TIMELINE_WINDOW_EVENTS, baseUrl, headers }),
    readOpening: (baseUrl, cutoffBlock, headers) =>
      fetchTimelineOpeningBalance({
        path: "/api/pwn/timeline/summary",
        params: { wallet },
        cutoffBlock,
        baseUrl,
        headers,
      }),
  });
  const summaries = tail.positions?.data ?? null;
  // The refusal above. Windowed AND multi-loan means the seeded figures would be
  // about a different position than the rows, so nothing is seeded.
  if (tail.cutoffBlock != null && summaries != null && summaries.length !== 1) return EMPTY;
  return { ...tail, summaries };
});
