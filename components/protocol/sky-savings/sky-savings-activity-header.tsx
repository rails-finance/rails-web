// The Sky Savings timeline's eyebrow: when the address first held sUSDS and
// what the span pill counts. An open position counts from its first event to
// today; a closed one from its first event to the event that emptied it.

import { Clock } from "lucide-react";
import { formatDate, formatDuration } from "@/lib/date";
import { PILL_META } from "@/lib/shared/ui-grammar";

export function SkySavingsActivityHeader({
  first,
  last,
  events,
  closed,
}: {
  first: number | null;
  last: number | null;
  events: { timestamp: number }[];
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
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-foreground">
        {closed ? `Held ${formatDate(lo)} to ${formatDate(hi)}` : `Holding since ${formatDate(lo)}`}
      </span>
      <span className={PILL_META} data-prov-exempt="">
        {closed ? `${formatDuration(lo, hi)} held` : `${formatDuration(lo, now)} to date`}
      </span>
      <span className={PILL_META} data-prov-exempt="">
        <Clock size={12} />
        last event {formatDuration(hi, now)} ago
      </span>
    </div>
  );
}
