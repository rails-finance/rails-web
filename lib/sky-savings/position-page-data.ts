// The reads of one Sky Savings position page, shared by the position route and
// its event route so a request makes them once (`cache`).

import { cache } from "react";
import { readerIpFromHeaders } from "@/lib/api/reader-ip-server";
import { readSkyFlowsDaily, readSkyPosition, readSkyRates, readSkyTimeline } from "@/lib/sources/api/sky-savings";
import { withSkyDrip } from "@/lib/sources/chain/sky-savings-drip";

/** The newest events the page draws. The whole life's figures (the card, the
 *  flows) come from the position row and the day rows, so a longer history is
 *  stated as a count and drawn to this many rows. */
const TIMELINE_ROWS = 1000;

export const loadSkyPosition = cache(async (holder: string) => {
  const readerIp = await readerIpFromHeaders();
  const position = await readSkyPosition(holder, readerIp);
  if (!position) return null;
  const [timeline, days, rates, asOf] = await Promise.all([
    readSkyTimeline(holder, { limit: TIMELINE_ROWS }, readerIp),
    readSkyFlowsDaily(holder, readerIp),
    readSkyRates(readerIp).catch(() => null),
    withSkyDrip(position.asOf),
  ]);
  // A history longer than the drawn window: the first event's time, for the
  // timeline header's tenure, from one oldest-first row.
  const first =
    timeline.total > timeline.events.length && position.data.activity.firstTimestamp == null
      ? await readSkyTimeline(holder, { limit: 1, order: "asc" }, readerIp).catch(() => null)
      : null;
  return { position, timeline, days, rates, asOf, firstAt: first?.events[0]?.timestamp ?? null };
});
