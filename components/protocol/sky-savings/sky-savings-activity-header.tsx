// The Sky Savings timeline's eyebrow: when the address first held sUSDS and
// what the span pill counts. An open position counts from its first event to
// today; a closed one from its first event to the event that emptied it.

import { Clock } from "lucide-react";
import { formatDate, formatDuration } from "@/lib/date";
import { PILL_META } from "@/lib/shared/ui-grammar";

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
  const now = Math.floor(Date.now() / 1000);
  const end = closed ? hi : now;
  const spanDays = Math.floor((end - lo) / DAY);
  const heldDays = complete ? daysHeld(events, end) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-foreground">
        {closed ? `Held ${formatDate(lo)} to ${formatDate(hi)}` : `Holding since ${formatDate(lo)}`}
      </span>
      <span className={PILL_META} data-prov-exempt="">
        {closed ? `${formatDuration(lo, hi)} held` : `${formatDuration(lo, now)} to date`}
      </span>
      {heldDays != null && heldDays < spanDays && (
        <span className={PILL_META} data-prov-exempt="">
          held on {heldDays.toLocaleString("en-US")} of {spanDays.toLocaleString("en-US")} days
        </span>
      )}
      <span className={PILL_META} data-prov-exempt="">
        <Clock size={12} />
        last event {formatDuration(hi, now)} ago
      </span>
    </div>
  );
}
