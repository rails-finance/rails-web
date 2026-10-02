"use client";

// The Sky Savings timeline's eyebrow: when the address first held sUSDS and
// what the span pill counts. An open position counts from its first event to
// today; a closed one from its first event to the event that emptied it.

import { useMountedNow } from "@/hooks/useMountedNow";
import { formatDate, formatDuration } from "@/lib/date";
import { MountedAge } from "@/components/shared/mounted-age";

const DAY = 86_400;

/** Whole days the address held sUSDS: from each event that left a balance to
 *  the next event (or to `end`), summed. Null when an event carries no balance. */
function daysHeld(events: { timestamp: number; context?: { data?: { sharesAfter?: string } } }[], end: number) {
  const rows = [...events].sort((a, b) => a.timestamp - b.timestamp);
  let seconds = 0;
  for (let i = 0; i < rows.length; i++) {
    const after = rows[i].context?.data?.sharesAfter;
    if (after == null) return null;
    if (BigInt(after) > BigInt(0)) seconds += Math.max(0, (rows[i + 1]?.timestamp ?? end) - rows[i].timestamp);
  }
  return Math.floor(seconds / DAY);
}

export function SkySavingsActivityHeader({
  first,
  last,
  events,
  complete = false,
  closed,
}: {
  first: number | null;
  last: number | null;
  events: { timestamp: number; context?: { data?: { sharesAfter?: string } } }[];
  /** Every event of the position is in `events`, so the days held can be counted. */
  complete?: boolean;
  closed: boolean;
}) {
  let lo = first ?? Infinity;
  let hi = last ?? 0;
  for (const e of events) {
    if (e.timestamp < lo) lo = e.timestamp;
    if (e.timestamp > hi) hi = e.timestamp;
  }
  if (!Number.isFinite(lo) || hi === 0) return null;
  // The span pill and the held-days pill read the clock for an open position,
  // so they appear only once the browser states it (MountedAge); a closed
  // position's figures are fixed by its events.
  return <SkySavingsHeaderBody lo={lo} hi={hi} events={events} complete={complete} closed={closed} />;
}

const META = "whitespace-nowrap text-rb-500";

function SkySavingsHeaderBody({
  lo,
  hi,
  events,
  complete,
  closed,
}: {
  lo: number;
  hi: number;
  events: { timestamp: number; context?: { data?: { sharesAfter?: string } } }[];
  complete: boolean;
  closed: boolean;
}) {
  const now = useMountedNow();
  const end = closed ? hi : (now ?? hi);
  const spanDays = Math.floor((end - lo) / DAY);
  const heldDays = complete && (closed || now != null) ? daysHeld(events, end) : null;
  return (
    // The spans as muted text on the heading line, the timeline header's rule
    // (rails-ops ui-jobs 227): only the filters below read as controls.
    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm">
      <span className="text-foreground">
        {closed ? `Held ${formatDate(lo)} to ${formatDate(hi)}` : `Holding since ${formatDate(lo)}`}
      </span>
      <span className={META} data-prov-exempt="">
        · {closed ? `${formatDuration(lo, hi)} held` : <MountedAge from={lo} suffix=" to date" />}
      </span>
      {heldDays != null && heldDays < spanDays && (
        <span className={META} data-prov-exempt="">
          · held on {heldDays.toLocaleString("en-US")} of {spanDays.toLocaleString("en-US")} days
        </span>
      )}
      <span className={META} data-prov-exempt="">
        · last event <MountedAge from={hi} suffix=" ago" />
      </span>
    </div>
  );
}
