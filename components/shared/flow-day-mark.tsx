"use client";

// The day's mark on a timeline card, on a page that ties the timeline to the
// Lifetime flows panel (flow-focus-context.tsx; rails-ops
// reference/lifetime-flows-scrubber.md, "The day links the chart and the
// timeline"). The chart moves in days, so the day is the unit the two share.
// The last event of each day (the newest, whose close the chart shows) states
// the day's date before its time, with a History icon button ("Timeline to
// 2 Sep '26") that freezes the chart's cursor on that day's close, which
// rewinds the list to it: the chart's frozen tag and the timeline's chip are
// the same state. The day's other events state their time only.

import { History } from "lucide-react";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";

const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** The UTC day (days since the epoch) of a unix-seconds moment. */
export const utcDay = (tsSec: number): number => Math.floor(tsSec / 86_400);

/** Asks the chart for a day's close (frozen there, so the list rewinds to
 *  it) and brings the panel into view. */
export function moveChartToDay(store: NonNullable<ReturnType<typeof useFlowFocus>>["store"], tsSec: number): void {
  const s = store.get();
  store.set({ move: { ts: tsSec, n: (s.move?.n ?? 0) + 1 } });
  const el = document.querySelector<HTMLElement>("[data-lifetime-flows-panel]");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/** The mark in the card header's time slot: the rewind button, then the
 *  date. `ts` is the event's moment; `flash` is set briefly after the frozen
 *  tag's "Timeline to …", and the card header rings while it is
 *  (event-card.tsx). */
export function FlowDayMark({ ts, flash = false }: { ts: number; flash?: boolean }) {
  const focus = useFlowFocus();
  const date = dayStamp(ts);
  return (
    <span
      className="inline-flex items-center gap-1"
      data-flow-day-mark={utcDay(ts)}
      {...(flash ? { "data-flow-day-flash": "" } : {})}
    >
      {focus?.model && (
        <button
          type="button"
          className="header-badge-tip -my-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-rb-500 transition-colors hover:bg-rb-100 hover:text-foreground focus-ring sm:-my-1 sm:size-6 dark:hover:bg-rb-800"
          aria-label={`Timeline and chart to ${date}`}
          data-tooltip={`Timeline to ${date}`}
          data-flow-day-move=""
          onClick={(e) => {
            // The header around it opens and closes the card.
            e.stopPropagation();
            moveChartToDay(focus.store, ts);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <History size={14} aria-hidden />
        </button>
      )}
      <span className="text-xs" data-flow-day-date="">
        {date}
      </span>
    </span>
  );
}
