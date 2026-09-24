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
//     once. A click selects that month and filters the rows to it; the same
//     month again clears it. No drag: a span is what the spread is for;
//   • the marks legend and the density key.
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
// Cells entirely below a windowed page's cut stay NON-SELECTABLE, and so do
// empty ones. Selecting a below-cut month would filter the loaded rows — all
// of which are at or after the cut — to nothing, and an opening balance is
// brought forward, not re-filtered (lib/shared/timeline-opening-balance.ts);
// selecting an empty one would filter them to nothing for the plainer reason
// that nothing is there.
//
// Every selection, typed or clicked, goes through `useTimelineEvents`'s own
// `setDateRange`, so it round-trips through `?from=`/`?to=` as UTC calendar
// days. A navigated view is a shareable view.

import { useMemo } from "react";
import { DensityRamp, MarkLegend } from "@/components/shared/transaction-heatmap";
// The grid itself through the LAZY boundary: this panel only ever renders
// after a press on the Date button, so no detail route should carry the
// heatmap in its initial bundle. The legend and the ramp are a few lines of
// markup each and come from the real module directly — routing them through a
// dynamic import would split a chunk to save nothing.
import { TransactionHeatmap } from "@/components/shared/transaction-heatmap-lazy";
import { getEventActionKey } from "@/lib/shared/event-filter-helpers";
import type { MarketNote } from "@/lib/shared/market-note";
import { RESET_LINK } from "@/lib/shared/ui-grammar";
import { buildSignificanceMarks } from "@/lib/shared/timeline-navigator";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";

const SECONDS_PER_DAY = 86_400;

/** A UTC calendar day as the wire value a native `date` input takes. The
 *  input renders it in the viewer's own locale, which is the one date on the
 *  page not formatted by us — it is a field, not a statement. */
const isoUtcDay = (unix: number): string => new Date(unix * 1000).toISOString().slice(0, 10);

/** The other direction: `YYYY-MM-DD` → the first second of that UTC day.
 *  Null on anything else, including the empty string a cleared field gives. */
const utcDayStart = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const ts = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000;
  return Number.isFinite(ts) ? ts : null;
};

const DATE_FIELD =
  "rounded-md bg-raised px-2 py-1 text-xs tabular-nums text-foreground focus-ring [color-scheme:light] dark:[color-scheme:dark]";

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

export interface TimelineNavigatorPanelProps {
  tl: TimelineEventsState;
  /** The notes the page is SHOWING — the anchored historical ones plus any
   *  live one, already gated on the reader's own market-notes toggle. A reader
   *  who has put notes away is not shown them on the map either, and the marks
   *  move no count on the page whichever way the toggle sits. */
  notes?: MarketNote[];
  /** Inside the phone sheet, whose pinned header already carries the count and
   *  Reset. The spread stays — it is the picker, not chrome. */
  inSheet?: boolean;
  /** False where the months have left this panel for the segment picker above
   *  the rows (decision 0019, amendment 2026-09-24, rule 1): the spread alone
   *  stands here, a filter typed within the loaded segment. */
  grid?: boolean;
}

export function TimelineNavigatorPanel({ tl, notes, inSheet, grid = true }: TimelineNavigatorPanelProps) {
  const events = tl.visibleEvents;
  const priorDays = tl.historyWindow.opening?.byDay;
  // The served folders' own days. They are part of the WINDOW, not of the
  // opening balance — see `TransactionHeatmapProps.windowDays`.
  const folderDays = tl.folderDays ?? undefined;
  const marks = useMemo(() => buildSignificanceMarks(events, notes ?? [], getEventActionKey), [events, notes]);
  const life = useMemo(() => lifeSpan(events, folderDays, priorDays), [events, folderDays, priorDays]);
  // A grouped page can hold no ungrouped events at all — every served row a
  // folder — and still have a life to draw, so the emptiness test is the span,
  // not the event list.
  if (!life) return null;

  const value = tl.dateRange;
  const from = isoUtcDay(value ? value[0] : life.first);
  const to = isoUtcDay(value ? value[1] : life.last);

  /** Both ends at once, because a range is one fact. One end alone is a single
   *  day — the reader has said WHEN, not yet how long — and the two ends in
   *  the wrong order are the same span typed backwards, so they are ordered
   *  rather than refused. The later end runs to the close of its own day,
   *  which is the form every other date selection on the page takes. */
  const commit = (nextFrom: string, nextTo: string) => {
    const a = utcDayStart(nextFrom);
    const b = utcDayStart(nextTo);
    if (a == null && b == null) {
      tl.setDateRange(null);
      return;
    }
    const one = (a ?? b) as number;
    const other = (b ?? a) as number;
    tl.setDateRange([Math.min(one, other), Math.max(one, other) + (SECONDS_PER_DAY - 1)]);
  };

  return (
    <div data-timeline-navigator="">
      {/* The header: the spread on the left, Reset on the right. No count —
          the control strip's own is still on screen just above the panel. */}
      <div className={`${grid ? "mb-3 " : ""}flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
        <div data-date-span-picker="" className="flex items-center gap-2">
          <input
            type="date"
            data-date-from=""
            aria-label="From date"
            value={from}
            onChange={(e) => commit(e.target.value, to)}
            className={DATE_FIELD}
          />
          <span aria-hidden className="text-xs text-rb-500">
            –
          </span>
          <input
            type="date"
            data-date-to=""
            aria-label="To date"
            value={to}
            onChange={(e) => commit(from, e.target.value)}
            className={DATE_FIELD}
          />
        </div>
        {!inSheet && value && (
          <button type="button" onClick={() => tl.setDateRange(null)} className={RESET_LINK}>
            Reset
          </button>
        )}
      </div>

      {grid && (
        <>
          <TransactionHeatmap
            events={events}
            priorDays={priorDays}
            windowDays={folderDays}
            value={value}
            onChange={tl.setDateRange}
            layout="months"
            chrome="plain"
            marks={marks}
            select="single"
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <MarkLegend marks={marks} />
            <DensityRamp />
          </div>
        </>
      )}
    </div>
  );
}
