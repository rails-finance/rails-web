// The Lifetime flows panel's loading shape (rails-ops TO-DO-ui-jobs §266):
// the scrubber's parts at the heights the settled panel takes (a position with
// a line, both sides), so nothing moves when the history lands. Phone (below
// sm) and desktop each take their own heights: the headlines, the two bars and
// their axis, the line with its marks and ends, the playback controls and, on
// a phone, the "Show to" button's own row. The panel's header and its (i) row
// are real while it loads. Heights measured 5 Oct 2026 on the Liquity V2 trove
// at 390, 430 and 1280: 415px phone, 332px desktop between the header and the
// (i) row.
//
// Over it, the waiting cue (ui-jobs 333): after 1.2 s an activity bar and the
// scale of the read ("Loading 44,898 events…" where the timeline has stated
// the count), and after 4 s, on a position past the timeline's preload, a
// line that large positions take longer. Both appear on CSS delays, so the
// cue keeps time while the main thread parses a large answer. The times are
// the measured waits on dev, 13 Oct 2026: 0.7 to 0.9 s on the families the
// server sums (Aave V3, SparkLend), 1.8 to 3 s at 3,000 to 14,000 events, 7
// to 10.5 s past 40,000 (Maple, Compound V2), where the browser reads the
// whole history.

import { TIMELINE_WINDOW_EVENTS } from "@/lib/shared/timeline-opening-balance";
import type { LifeCount } from "@/lib/shared/life-count-store";

const BLOCK = "rounded-md bg-rb-300/70 dark:bg-rb-700/60";

/** The cue's words: the scale of the read where the count is known. */
export function flowsWaitingLine(count: LifeCount | null): string {
  if (!count) return "Loading the flow history…";
  const n = count.n.toLocaleString("en-US");
  return `Loading ${count.atLeast ? "at least " : ""}${n} ${count.n === 1 ? "event" : "events"}…`;
}

/** The activity bar and the lines over the skeleton; aria-hidden, since the
 *  panel's status line says the same to a screen reader. */
export function LifetimeFlowsWaiting({ count }: { count: LifeCount | null }) {
  const large = count != null && count.n > TIMELINE_WINDOW_EVENTS;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center px-4"
      aria-hidden
      data-flows-cue=""
      data-anatomy="F20"
    >
      <div className="flows-cue-in flex max-w-[22rem] flex-col items-center rounded-lg bg-raised px-4 py-3 text-center shadow-sm">
        <div className="flows-cue-bar h-1 w-32 overflow-hidden rounded-full bg-rb-200 dark:bg-rb-700" />
        <p className="mt-2 text-sm text-foreground" data-flows-cue-line="">
          {flowsWaitingLine(count)}
        </p>
        {large && (
          <div className="flows-cue-late" data-flows-cue-late="">
            <p className="min-h-0 overflow-hidden text-xs text-rb-500">
              <span className="block pt-1">
                Large positions take longer to load. Faster loading is coming to Rails.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function LifetimeFlowsSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact)
    // The compact view's shape: the headlines over their bars, the value
    // chart and the price chart under its heading, side by side from md.
    return (
      <div
        className="mt-2 grid animate-pulse grid-cols-2 items-end gap-x-5 gap-y-6 md:grid-cols-3"
        aria-hidden
        data-flows-skeleton="compact"
      >
        <div className="col-span-2 self-start md:col-span-1">
          <div className={`${BLOCK} mb-1.5 h-7 w-32`} />
          <div className={`${BLOCK} h-8`} />
          <div className={`${BLOCK} mb-1.5 mt-4 h-7 w-28`} />
          <div className={`${BLOCK} h-8`} />
        </div>
        <div className={`${BLOCK} h-20 opacity-60`} />
        <div>
          <div className={`${BLOCK} mb-2 h-5 w-40`} />
          <div className={`${BLOCK} h-20 opacity-60`} />
        </div>
      </div>
    );
  return (
    <div className="mt-2 animate-pulse" aria-hidden data-flows-skeleton="">
      {/* Headlines, and the date at the row's right end (it wraps under them
          on a phone). */}
      <div className="mb-2 flex h-[53px] flex-wrap items-start gap-x-6 sm:h-7 sm:items-center">
        <div className={`${BLOCK} h-7 w-32`} />
        <div className={`${BLOCK} h-7 w-28`} />
        <div className={`${BLOCK} ml-auto h-4 w-12 max-sm:mt-2`} />
      </div>
      {/* The held and owed bars on their axis. */}
      <div className={`${BLOCK} h-10 sm:h-11`} />
      <div className={`${BLOCK} mt-3 h-10 sm:h-11`} />
      <div className="mt-1 h-4" />
      {/* The line, its marks and its two ends. */}
      <div className={`${BLOCK} mt-4 h-20 opacity-60`} />
      <div className="h-[26px] sm:h-5" />
      <div className="flex h-4 justify-between px-2">
        <div className={`${BLOCK} h-3 w-14`} />
        <div className={`${BLOCK} h-3 w-10`} />
      </div>
      {/* The playback controls, and the "Show to" button: its own row on a
          phone, the controls' right end from sm. */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className={`${BLOCK} h-11 w-[220px] sm:h-9 sm:w-[184px]`} />
        <div className={`${BLOCK} h-11 w-full sm:h-9 sm:w-40`} />
      </div>
    </div>
  );
}
