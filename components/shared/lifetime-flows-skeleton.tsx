// The Lifetime flows panel's loading shape (rails-ops TO-DO-ui-jobs §266, 337):
// the combined body's parts at the heights the settled body takes, so nothing
// moves when the history lands. Top to bottom: the bars (the old-price line,
// then each side's headline over its bar: one side for a savings position,
// two where there is debt), the events heading with its charts button, the
// value and price chart where the charts are shown, then the events' pips and
// the cursor's date with the steps. Phone (below sm) and desktop take their
// own heights, and a touch screen its taller controls. Measured 12 Nov 2026,
// desktop and phone: 236 and 250 px with one side (Maple), 318 and 332 px with
// two (Aave V3, Liquity V2); with the charts shown, 536 and 590 px, 618 and
// 672 px. A protocol activity chart under the events (Liquity V2) is not
// reserved.
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

import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";
import type { LifeCount } from "@/lib/shared/life-count-store";

/** Progress of a background build: `stored` of `rows` events are in. */
export interface FlowsBuilding {
  stored: number;
  rows: number;
}

const BLOCK = "rounded-md bg-rb-300/70 dark:bg-rb-700/60";

/** The cue's words: the scale of the read where the count is known. */
export function flowsWaitingLine(count: LifeCount | null): string {
  if (!count) return "Loading the flow history…";
  const n = count.n.toLocaleString("en-US");
  return `Loading ${count.atLeast ? "at least " : ""}${n} ${count.n === 1 ? "event" : "events"}…`;
}

/** The cue's words while the server builds the history in the background:
 *  the rows stored so far of the wallet's rows, where it states them. */
export function flowsBuildingLine(building: FlowsBuilding): string {
  const total = building.rows.toLocaleString("en-US");
  if (building.stored <= 0 || building.rows <= 0) return "Building the flow history…";
  return `Building the flow history: ${building.stored.toLocaleString("en-US")} of ${total} events`;
}

/** The activity bar and the lines over the skeleton; aria-hidden, since the
 *  panel's status line says the same to a screen reader. */
export function LifetimeFlowsWaiting({ count, line }: { count: LifeCount | null; line?: string }) {
  const large = line == null && count != null && count.n > TIMELINE_WINDOW_ROWS;
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
          {line ?? flowsWaitingLine(count)}
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

/** What the settled body will draw, where the page knows before the history
 *  lands: how many sides the bars take, and whether a switch row (Maple's
 *  pools) stands over them. */
export interface FlowsSkeletonShape {
  sides?: 1 | 2;
  switchRow?: boolean;
}

export function LifetimeFlowsSkeleton({
  compact = false,
  sides = 2,
  switchRow = false,
  viewToggle = true,
}: FlowsSkeletonShape & {
  compact?: boolean;
  /** The charts' button beside the events heading; a page with no toggle
   *  keeps the heading on one row. */
  viewToggle?: boolean;
}) {
  return (
    <div className="mt-2 animate-pulse" aria-hidden data-flows-skeleton={compact ? "compact" : ""}>
      {switchRow && <div className={`${BLOCK} mb-3 h-8 w-36`} />}
      {/* The old-price line, then each side's headline over its bar. */}
      <div className="h-5" />
      {Array.from({ length: sides }, (_, i) => (
        <div key={i} className={i > 0 ? "mt-4" : undefined}>
          <div className="mb-1.5 flex h-7 items-center">
            <div className={`${BLOCK} h-6 w-32`} />
          </div>
          <div className={`${BLOCK} h-8`} />
        </div>
      ))}
      {/* The events heading and its charts button: the button wraps under
          the heading on a phone while the charts are shown. */}
      <div
        className={`mt-6 flex items-start justify-between gap-3 ${
          !compact && viewToggle
            ? "h-[72px] sm:h-8 pointer-coarse:h-24 sm:pointer-coarse:h-11"
            : "h-8 pointer-coarse:h-11"
        }`}
      >
        <div className="flex h-8 items-center gap-3 pointer-coarse:h-11">
          <div className={`${BLOCK} h-4 w-14`} />
          {compact && viewToggle && <div className={`${BLOCK} h-8 w-36 pointer-coarse:h-11`} />}
        </div>
        <div className={`${BLOCK} size-7 rounded-full`} />
      </div>
      <div className="mt-3">
        {/* The value and price chart: its range buttons, then the chart. */}
        {!compact && (
          <>
            <div className="mb-1.5 flex h-5 gap-1 pointer-coarse:h-9">
              <div className={`${BLOCK} h-5 w-24 pointer-coarse:h-9`} />
            </div>
            <div className={`${BLOCK} h-[250px] opacity-60`} />
            <div className="h-6" />
          </>
        )}
        {/* The events' pips, then the cursor's date with the steps. */}
        <div className={compact ? "mt-2" : undefined}>
          <div className={`${BLOCK} h-11 sm:h-[38px]`} />
          <div className={`${BLOCK} mt-2 h-11 sm:h-9`} />
        </div>
      </div>
    </div>
  );
}
