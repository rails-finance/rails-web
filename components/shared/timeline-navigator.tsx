"use client";

// The timeline navigator — the timeline's date control, on every family the
// shared driver serves. The significance marks live in
// lib/shared/timeline-navigator.ts.
//
// ⚠️ IT WAS BEHIND `?nav=1` FOR ONE DAY (2026-09-11) and the flag is now
// deleted, not defaulted on. What the flag switched to — an inline heatmap
// that opened below the control strip and pushed the rows down, and that stood
// open for as long as a range was selected — is deleted with it. One grammar.
//
// ── THE MODEL: ONE GRID, IN A DROPDOWN, OVER THE ROWS
//
// The Date button in the toolbar opens a panel the full width of the timeline
// that floats OVER the rows. In it, top to bottom:
//
//   • the SPREAD — the selected dates, editable, and the way to pick a day or
//     a span by hand. It is the date picker; there is no second one;
//   • RESET, when there is something to reset;
//   • the MONTH MATRIX — the year-row × month-column grid the position page
//     has always drawn, every month the position lived through on screen at
//     once. A click shows that month's rows beneath; the same month again
//     clears it. No drag: a span is what the spread is for;
//   • the density key.
//
// ── THE TWO PATHS A MONTH CLICK TAKES (decision 0019, amendment 2026-09-25)
//
// Where the LOADED ROWS already hold the month, the click filters them, which
// is instant. Where they do not, which is a month below the preload's oldest
// row or any other month while the page stands on one it read, the page READS
// that month from the index as its own segment, brought-forward opening
// balance and all, which costs a request. So every month of the life that
// holds an event is one click away; an empty month and a month outside the
// life are drawn and refuse the click as they always have.
//
// ⚠️ THE SECOND PATH IS THE CALLER'S TO OFFER. A page that passes no `reach`
// keeps the first alone and its below-cut months keep refusing, which is what
// a `?folders=0` page and every family without the segment read do.
//
// The panel CLOSES on a pick, either path (Miles, 2026-09-25): the reader
// asked for rows, and a map left standing over them is in the way.
//
// ⚠️ ON THE picker-inline REVIEW BRANCH (Miles, 2026-09-25) this panel
// differs from the paragraphs above in three ways, for comparison only, not
// a decision: the typed spread (the two date inputs) is gone on both the
// desktop panel and the phone sheet, the grid is the only filter; the
// density key is gone and Reset sits where it stood, same on both; and on
// the DESKTOP panel only, a pick no longer closes it, so a reader can click
// through several months in a row — it closes on a second press of the Date
// button, or stays as it is on Reset (which did not close it before this
// branch either). The phone sheet still closes on a pick. See
// `timeline-toolbar.tsx`'s desktop branch for the close-on-pick wiring.
//
// ⚠️ THE SIGNIFICANCE MARKS ARE GONE, 2026-09-25, everywhere: the
// liquidation dot, the owner-signed underline, the market-note ring, their
// legend and the builder behind them (`lib/shared/timeline-navigator.ts`,
// deleted). Miles: "the heatmap is enough and if users need to find a
// liquidation they can use the event filter". The density key stays.
//
// No title. The button that opened the panel already carries the range, so a
// panel that re-announced itself would be saying the same thing twice.
//
// ── ⚠️ WHAT WAS DELETED ON 2026-09-11, BY DECISION
//
// The DAY TIER — a month opened to a calendar of its days underneath, and a
// day inside it was the finest selection. And before that, the first build's
// overview/detail pair, its derived grain, its Earlier/Later stepper and its
// read-position hairline.
//
// Asked what he preferred about the page WITHOUT the flag, Miles chose "one
// grid, no drilling" and "it's the rows, not the map": the map should get a
// reader roughly to the right place and then get out of the way, and "you can
// see if a day is busy by scrolling down the timeline so that is not needed".
// A drill-down is a second application above the rows however well it is
// built, and this prototype has now been over-invested in twice. What remains
// is one grid and one editable spread.
//
// This was the third revision of the same model in a day, which is the point of
// a flag. It is NOT rot: the absence of a day tier is a decision, and
// `verify-timeline-navigator.mjs` says so in its own header so the missing
// checks do not read later as checks that quietly stopped running.
//
// ── WHY A DROPDOWN, AND WHY IT DOES NOT RESTATE THE COUNT
//
// The panel used to stand permanently above the rows, which cost every reader
// its height on every screenful. Miles raised the obvious objection to moving
// it into a dropdown himself — "the reason the heatmap was not a dropdown is
// because it would obscure the page it is filtering". On the desktop it does
// not: it hangs BELOW the control strip, so the strip's own count line stays
// on screen about forty pixels above the panel's top edge, and a second copy
// inside the panel said the same thing twice within one glance (Miles,
// 2026-09-11). The phone sheet is the case where the objection holds — it
// covers the strip — so there the count rides in the sheet's pinned header
// (`MobileSheetFilterHeader`), which is where every other filter sheet has
// carried it for months.
//
// ── WHAT IT MAY NOT DO
//
// An EMPTY month is drawn and refuses the click: filtering to it would empty
// the list for the plainest reason there is, that nothing is there. So does a
// month outside the life. Without a `reach`, so does a month entirely below a
// windowed page's cut, the loaded rows all being at or after the cut and an
// opening balance being brought forward, not re-filtered
// (lib/shared/timeline-opening-balance.ts).
//
// Every FILTER, typed or clicked, goes through `useTimelineEvents`'s own
// `setDateRange`, so it round-trips through `?from=`/`?to=` as UTC calendar
// days. A navigated view is a shareable view. A month READ as a segment is
// the page's own state and writes no query of its own.

import { useMemo } from "react";
// The grid itself through the LAZY boundary: this panel only ever renders
// after a press on the Date button, so no detail route should carry the
// heatmap in its initial bundle. The legend and the ramp are a few lines of
// markup each and come from the real module directly — routing them through a
// dynamic import would split a chunk to save nothing.
import { TransactionHeatmap } from "@/components/shared/transaction-heatmap-lazy";
import { RESET_LINK } from "@/lib/shared/ui-grammar";
import { lifeExtent } from "@/lib/shared/timeline-segments";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";

/** The position's whole life in seconds, over ALL THREE contributors to the
 *  history — the loaded rows, the served folders' own day histogram and the
 *  opening balance's, on the same keys the grid merges them on. It is what the
 *  spread shows when nothing is selected: the reader is looking at all of it,
 *  and the field says so rather than sitting empty.
 *
 *  The folders extend both ends and the opening balance only the older one: a
 *  folder holds served events, which can be newer than every ungrouped row,
 *  while an opening balance is by construction below the cut. */
function lifeSpan(
  events: { timestamp: number }[],
  folderDays: { key: string; count: number }[] | undefined | null,
  priorDays: { key: string; count: number }[] | undefined | null,
): { first: number; last: number } | null {
  let minTs = Infinity;
  let maxTs = 0;
  for (const e of events) {
    if (e.timestamp < minTs) minTs = e.timestamp;
    if (e.timestamp > maxTs) maxTs = e.timestamp;
  }
  for (const b of folderDays ?? []) {
    const ts = Number(b.key);
    if (!Number.isFinite(ts)) continue;
    if (ts < minTs) minTs = ts;
    if (ts > maxTs) maxTs = ts;
  }
  if (!Number.isFinite(minTs) || maxTs === 0) return null;
  for (const b of priorDays ?? []) {
    const ts = Number(b.key);
    if (Number.isFinite(ts) && ts < minTs) minTs = ts;
  }
  return { first: minTs, last: maxTs };
}

/** The second path: a month the loaded rows do not hold, read from the index
 *  as the page's own segment. The page owns the read and its state; this panel
 *  draws the months and hands a pick back. */
export interface TimelineMonthReach {
  /** The whole life's events per UTC day (lib/shared/timeline-segments.ts):
   *  the grid's counts and its extent, so the ramp does not move when the page
   *  swaps the rows under it for one month's. */
  lifeDays: ReadonlyMap<number, number>;
  /** The month the page is standing on, or null when it holds the rows it
   *  opened with. */
  month: number | null;
  /** Read that month as the page's segment. */
  onReach: (monthIdx: number) => void;
  /** Back to the rows the page opened with. Null when it already holds them. */
  onReset: (() => void) | null;
}

export interface TimelineNavigatorPanelProps {
  tl: TimelineEventsState;
  /** Inside the phone sheet, whose pinned header already carries the count and
   *  Reset. The spread stays — it is the picker, not chrome. */
  inSheet?: boolean;
  /** The second path, where the page offers one. See `TimelineMonthReach`. */
  reach?: TimelineMonthReach;
  /** A month was picked, either path: the panel closes on it. */
  onPicked?: () => void;
}

export function TimelineNavigatorPanel({ tl, inSheet, reach, onPicked }: TimelineNavigatorPanelProps) {
  const events = tl.visibleEvents;
  const priorDays = tl.historyWindow.opening?.byDay;
  // The served folders' own days. They are part of the WINDOW, not of the
  // opening balance — see `TransactionHeatmapProps.windowDays`.
  const folderDays = tl.folderDays ?? undefined;
  const reachLife = reach?.lifeDays;
  const life = useMemo(() => {
    // With a reach the life is the whole life the page knows, which is what
    // the grid draws and what an unselected spread opens on. A segment loaded
    // would otherwise shrink both to the one month on the page.
    if (reachLife) {
      const extent = lifeExtent(reachLife);
      return extent ? { first: extent.firstAt, last: extent.lastAt } : null;
    }
    return lifeSpan(events, folderDays, priorDays);
  }, [reachLife, events, folderDays, priorDays]);
  /** The span the rows ON THE PAGE cover, which is where the first path reaches.
   *  `sortedEvents` is every loaded row whatever the filters, and `servedSpan`
   *  extends it over the folders, so this is the same span the count line
   *  states in time. */
  const held = useMemo<[number, number] | null>(() => {
    if (!reach) return null;
    let first = tl.sortedEvents.length > 0 ? tl.sortedEvents[0].timestamp : Infinity;
    let last = tl.sortedEvents.length > 0 ? tl.sortedEvents[tl.sortedEvents.length - 1].timestamp : -Infinity;
    if (tl.servedSpan) {
      first = Math.min(first, tl.servedSpan.firstAt);
      last = Math.max(last, tl.servedSpan.lastAt);
    }
    return Number.isFinite(first) && Number.isFinite(last) ? [first, last] : null;
  }, [reach, tl.sortedEvents, tl.servedSpan]);
  // A grouped page can hold no ungrouped events at all — every served row a
  // folder — and still have a life to draw, so the emptiness test is the span,
  // not the event list.
  if (!life) return null;

  const value = tl.dateRange;
  /** Anything to go back FROM: a typed or clicked filter, or a segment the
   *  page read. Reset returns the rows the page opened with, both at once. */
  const resettable = value != null || reach?.onReset != null;
  const resetAll = () => {
    tl.setDateRange(null);
    reach?.onReset?.();
  };

  return (
    <div data-timeline-navigator="">
      <TransactionHeatmap
        events={events}
        priorDays={priorDays}
        windowDays={folderDays}
        lifeDays={reach?.lifeDays}
        held={held}
        reachMonth={
          reach
            ? (monthIdx) => {
                reach.onReach(monthIdx);
                onPicked?.();
              }
            : null
        }
        currentMonth={reach?.month ?? null}
        value={value}
        onChange={(next) => {
          tl.setDateRange(next);
          onPicked?.();
        }}
        layout="months"
        chrome="plain"
        select="single"
      />

      {/* The heat legend stood here; Reset takes its place (Miles,
          2026-09-25). The grid is the only date filter now, so the one thing
          left to offer beside it is a way back. Withheld in the sheet, whose
          own header carries Reset already. */}
      {!inSheet && resettable && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={resetAll} className={RESET_LINK}>
            Reset
          </button>
        </div>
      )}
    </div>
  );
}
