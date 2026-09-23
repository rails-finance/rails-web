"use client";

import { createContext, useContext } from "react";
import { formatDate } from "@/lib/date";
import { formatTimestamp } from "@/lib/shared/format-event";
import { useTimelineDisplay } from "./timeline-display-context";

/**
 * Optional date prefix for the next event's timestamp.
 * Set by the timeline renderer for the first event of each day
 * (e.g. "Mar 15 '24"); null/empty for subsequent events.
 */
export const EventDateContext = createContext<string | null>(null);

/**
 * Renders an event timestamp. When inside an EventDateContext that
 * provides a non-empty prefix, prepends the date so the first event
 * of each day reads e.g. "15 Mar '24 14:30".
 *
 * The clock is UTC — a block timestamp IS a UTC instant, and it is also what
 * lets this render on the server (see formatTimestamp). Nothing on the row
 * says so, because a "UTC" on every row of a 200-row list is noise; the zone
 * is stated in the two places a reader can act on it: the display menu item
 * that turns these on ("Timestamps (UTC)"), and this title, which also names
 * the UTC day — the fact most at risk near midnight, where a reader's own
 * zone would put the event on the other side of the date.
 */
export function EventTime({ ts }: { ts: number }) {
  const datePrefix = useContext(EventDateContext);
  const { showTimestamps } = useTimelineDisplay();
  if (!showTimestamps) return null;
  const time = formatTimestamp(ts);
  return (
    <>
      {datePrefix && <span className="text-xs">{datePrefix} </span>}
      <span className="text-xs text-rb-500" title={`${formatDate(ts)} ${time} UTC`}>
        {time}
      </span>
    </>
  );
}
