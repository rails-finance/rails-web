"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatDate } from "@/lib/date";
import { formatTimestamp } from "@/lib/shared/format-event";

/**
 * Optional date prefix for the next event's timestamp.
 * Set by the timeline renderer for the first event of each day
 * (e.g. "Mar 15 '24"); null/empty for subsequent events.
 */
export const EventDateContext = createContext<string | null>(null);

/**
 * A mark that stands in the date prefix's place: on a page that ties the
 * timeline to the Lifetime flows panel, the last event of each day carries
 * the day's date and a "View on chart" button (flow-day-mark.tsx). It shows
 * with timestamps off too, since nothing else dates the day there.
 */
export const EventDayMarkContext = createContext<ReactNode>(null);

/**
 * Renders an event timestamp. When inside an EventDateContext that
 * provides a non-empty prefix, prepends the date so the first event
 * of each day reads e.g. "15 Mar '24 14:30".
 *
 * The clock is UTC — a block timestamp IS a UTC instant, and it is also what
 * lets this render on the server (see formatTimestamp). Nothing on the row
 * says so, because a "UTC" on every row of a 200-row list is noise; the zone
 * is stated in this title, which names the UTC day — the fact most at risk
 * near midnight, where a reader's own zone would put the event on the other
 * side of the date.
 */
export function EventTime({ ts }: { ts: number }) {
  const datePrefix = useContext(EventDateContext);
  const mark = useContext(EventDayMarkContext);
  const time = formatTimestamp(ts);
  return (
    <>
      {mark ? <>{mark} </> : datePrefix && <span className="text-xs">{datePrefix} </span>}
      <span className="text-xs text-rb-500" title={`${formatDate(ts)} ${time} UTC`}>
        {time}
      </span>
    </>
  );
}
