"use client";

// The timeline's day header on a page that ties it to the Lifetime flows panel
// (flow-focus-context.tsx; rails-ops reference/lifetime-flows-scrubber.md, "The
// day links the chart and the timeline"). The chart moves in days, so the day
// is the unit the two share: every day with events gets a header with its date,
// the position at that day's close (the figures the chart states there), and
// "View on chart", which moves the chart's cursor to that close and freezes it
// there; the chart's "View on timeline" comes back to this header. The event
// rows under it state their time only.

import { useMemo } from "react";
import { ChartBarBig } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { SPINE_COLORS } from "@/components/shared/spine-column";
import { useTimelineScale } from "@/components/shared/activity-timeline";
import { CTRL_GHOST, CTRL_OFF } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { DAY_MS, formatFlowUsd, stateAt } from "@/lib/shared/flows-timeline";
import { flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

/** The UTC day (days since the epoch) of a unix-seconds moment. */
export const utcDay = (tsSec: number): number => Math.floor(tsSec / 86_400);

/** Asks the chart for a day's close (frozen there) and brings the panel into
 *  view. */
export function moveChartToDay(store: NonNullable<ReturnType<typeof useFlowFocus>>["store"], tsSec: number): void {
  const s = store.get();
  store.set({ move: { ts: tsSec, n: (s.move?.n ?? 0) + 1 } });
  const el = document.querySelector<HTMLElement>("[data-lifetime-flows-panel]");
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
}

/** One day's header. `ts` is any moment of the day; `line` draws the spine
 *  through the header's left column (off where nothing stands above it);
 *  `flash` marks it briefly after the chart's "View on timeline". */
export function FlowDayHeader({ ts, line, flash = false }: { ts: number; line: boolean; flash?: boolean }) {
  const focus = useFlowFocus();
  const scale = useTimelineScale();
  const model = focus?.model ?? null;
  const date = dayStamp(ts);
  const close = useMemo(() => {
    if (!model) return null;
    const stop = utcDay(ts) - model.start / DAY_MS;
    if (stop < 0) return null;
    // A day with events is always a stop before the live one (the live
    // stop is at least the day after the last event), so this is the day's
    // close, today's included.
    return { st: stateAt(model, stop), hasDebt: model.buckets.some((b) => b.side === "debt") };
  }, [model, ts]);
  const when = `the end of ${date}`;
  return (
    // The card's padding, so the spine and the text line up with the cards'.
    <div
      className={`flex w-full scroll-mt-4 items-stretch rounded-xl transition-shadow duration-[2000ms] ${
        flash ? "ring-2 ring-teal-500/70" : "ring-0 ring-teal-500/0"
      }`}
      style={{ paddingLeft: scale.cardPad, paddingRight: scale.cardPad }}
      data-flow-day={utcDay(ts)}
      {...(flash ? { "data-flow-day-flash": "" } : {})}
    >
      {/* The spine runs on through the header, as between two cards. */}
      <div aria-hidden className="relative hidden w-2/5 shrink-0 sm:block">
        {line && (
          <div
            className="absolute left-1/2 w-px -translate-x-1/2"
            style={{ top: -8, bottom: -28, backgroundColor: SPINE_COLORS.default }}
          />
        )}
      </div>
      <div className="flex min-w-0 grow items-center gap-x-2 border-b border-rb-200 py-1 pl-1 sm:pl-5 dark:border-rb-700">
        <div className="flex min-w-0 grow flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h3 className="text-sm font-semibold tabular-nums text-foreground" data-flow-day-date="">
            {date}
          </h3>
          {close && model && (
            <p className="text-xs tabular-nums text-rb-500" data-flow-day-close="">
              Position at close:{" "}
              <Prov info={flowSegmentProv(close.st.collateral.bar[0], "collateral", when, false, model.daily)}>
                {formatFlowUsd(close.st.collateral.now)}
              </Prov>{" "}
              {model.labels.collateral.toLowerCase()}
              {close.hasDebt && (
                <>
                  ,{" "}
                  <Prov info={flowSegmentProv(close.st.debt.bar[0], "debt", when, false, model.daily)}>
                    {formatFlowUsd(close.st.debt.now)}
                  </Prov>{" "}
                  {model.labels.debt.toLowerCase()}
                </>
              )}
            </p>
          )}
        </div>
        {focus && model && (
          <button
            type="button"
            className={`${CTRL_GHOST} ${CTRL_OFF} min-h-11 shrink-0 gap-1.5 whitespace-nowrap rounded-md px-2 text-xs sm:min-h-8`}
            aria-label={`View ${date} on the chart`}
            data-flow-day-move=""
            onClick={() => moveChartToDay(focus.store, ts)}
          >
            <ChartBarBig size={14} aria-hidden />
            View on chart
          </button>
        )}
      </div>
    </div>
  );
}
