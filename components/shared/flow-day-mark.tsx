"use client";

// The day's mark on a timeline card, on a page that ties the timeline to the
// Lifetime flows panel (flow-focus-context.tsx; rails-ops
// reference/lifetime-flows-scrubber.md, "The day links the chart and the
// timeline"). The chart moves in days, so the day is the unit the two share.
// The last event of each day (the newest, whose close the chart shows) states
// the day's date before its time, with a chart button ("View on chart") that
// moves the chart's cursor to that day's close and freezes it there. The page
// stays where it is (Miles, 1 Oct 2026); where the panel is off screen a short
// note beside the date says the chart moved and which way it lies ("Chart
// moved ↑"). The timeline is untouched. The button hides while the chart
// is frozen on that day. The day's other events state their time only.

import { useEffect, useState } from "react";
import { ChartBarBig } from "lucide-react";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";

const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** The UTC day (days since the epoch) of a unix-seconds moment. */
export const utcDay = (tsSec: number): number => Math.floor(tsSec / 86_400);

/** Asks the chart for a day's close, frozen there. The page does not
 *  scroll; the answer is where the panel lies against the screen: "up",
 *  "down", or null where it is in view or not drawn. */
export function moveChartToDay(
  store: NonNullable<ReturnType<typeof useFlowFocus>>["store"],
  tsSec: number,
): "up" | "down" | null {
  const s = store.get();
  store.set({ move: { ts: tsSec, n: (s.move?.n ?? 0) + 1 } });
  // The shared panel, or the panel a page draws around the scrubber (Aave V4).
  const el =
    document.querySelector<HTMLElement>("[data-lifetime-flows-panel]") ??
    document.querySelector<HTMLElement>("[data-flows-combined]")?.closest<HTMLElement>(".rounded-2xl") ??
    null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.bottom < 0 ? "up" : r.top > window.innerHeight ? "down" : null;
}

/** The mark in the card header's time slot: the chart button, then the
 *  date. `ts` is the event's moment; `flash` is set briefly after "Apply to
 *  timeline" or the timeline chip brings the card into view, and the card
 *  header rings while it is (event-card.tsx). */
export function FlowDayMark({ ts, flash = false }: { ts: number; flash?: boolean }) {
  const focus = useFlowFocus();
  const frozenHere = useFlowFocusState((s) => s.frozenDay === utcDay(ts));
  const date = dayStamp(ts);
  // The note that the chart moved, for a moment, where the panel is off
  // screen; a screen reader hears it wherever the panel is.
  const [moved, setMoved] = useState<{ dir: "up" | "down" | null; n: number } | null>(null);
  useEffect(() => {
    if (!moved) return;
    const off = window.setTimeout(() => setMoved(null), 2500);
    return () => window.clearTimeout(off);
  }, [moved]);
  return (
    <span
      className="inline-flex items-center gap-1"
      data-flow-day-mark={utcDay(ts)}
      data-anatomy="T7"
      {...(flash ? { "data-flow-day-flash": "" } : {})}
    >
      {focus?.model && !frozenHere && (
        <button
          type="button"
          className="header-badge-tip -my-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-rb-500 transition-colors hover:bg-rb-100 hover:text-foreground focus-ring sm:-my-1 sm:size-6 dark:hover:bg-rb-800"
          aria-label={`View ${date} on the chart`}
          data-tooltip="View on chart"
          data-flow-day-move=""
          onClick={(e) => {
            // The header around it opens and closes the card.
            e.stopPropagation();
            const dir = moveChartToDay(focus.store, ts);
            setMoved((m) => ({ dir, n: (m?.n ?? 0) + 1 }));
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <ChartBarBig size={14} aria-hidden />
        </button>
      )}
      <span className="text-xs" data-flow-day-date="">
        {date}
      </span>
      <span role="status" className="text-xs text-teal-600 dark:text-teal-400" data-flow-day-moved="">
        {moved && (
          <>
            <span className={moved.dir ? undefined : "sr-only"}>
              Chart moved<span className="sr-only"> to {date}</span>
            </span>
            {moved.dir && <span aria-hidden>{moved.dir === "up" ? " ↑" : " ↓"}</span>}
          </>
        )}
      </span>
    </span>
  );
}
