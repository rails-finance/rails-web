"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { RESET_LINK } from "@/lib/shared/ui-grammar";
// The life reduced to months, on the same `year * 12 + month` key this grid
// has always used for a cell.
import { monthCounts } from "@/lib/shared/timeline-segments";

// GitHub-style activity heatmap. Doubles as a date-range selector for the
// timeline below: click a cell for a single-day filter, or drag across cells
// for a range. Cells outside the events' lifetime render transparent so the
// grid stays a clean rectangle but only "live" days are interactive.
//
// Day buckets are UTC-aligned to match how event timestamps are stored — a
// localised grid would shift events between cells based on the viewer's
// timezone. The trade-off is that "today" can read as "yesterday" for users
// past UTC midnight; cheap price for cross-timezone consistency.

const SECONDS_PER_DAY = 86_400;
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfUtcDay(ts: number): number {
  return Math.floor(ts / SECONDS_PER_DAY) * SECONDS_PER_DAY;
}

function dayOfWeekMon0(ts: number): number {
  // Date.getUTCDay returns 0=Sun..6=Sat. Shift so Mon=0, Sun=6.
  return (new Date(ts * 1000).getUTCDay() + 6) % 7;
}

function fmtFullDate(ts: number): string {
  const d = new Date(ts * 1000);
  // Weekday alone, via Intl: only the month name disagrees between Node and
  // the browser (see lib/date.ts), so the day/month/year below come from
  // MONTH_NAMES instead and only the weekday still asks the runtime.
  const weekday = d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short" });
  return `${weekday}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Five intensity levels (0 = empty … 4 = busiest) → Tailwind classes.
export function bucketClass(level: number): string {
  switch (level) {
    case 0:
      return "bg-rb-200/50 dark:bg-rb-900/60";
    case 1:
      return "bg-teal-400/30 dark:bg-teal-500/30";
    case 2:
      return "bg-teal-400/55 dark:bg-teal-500/55";
    case 3:
      return "bg-teal-500/75 dark:bg-teal-400/75";
    default:
      return "bg-teal-500 dark:bg-teal-400";
  }
}

// Absolute scale — one cell = one DAY (weeks layout). GitHub-style per-day
// thresholds: a day with 5+ events reads as "busy".
function absLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}
const bucketColor = (count: number): string => bucketClass(absLevel(count));

// Relative scale — one cell = one MONTH (months layout). A month trivially
// clears any absolute "busy" threshold, so the absolute scale would saturate
// every active month to max — a 5-event month reading identically to a
// 3,000-event one. Instead scale each month against the busiest month in view,
// on a log curve so a heavy-tailed distribution still spreads across the four
// shades. Quiet histories (busiest month ≤ 4 events) fall back to the absolute
// scale so a low-activity position isn't forced dark.
export function relLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 4) return absLevel(count);
  const r = Math.log(count + 1) / Math.log(max + 1); // (0, 1]
  if (r <= 0.25) return 1;
  if (r <= 0.5) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

const CELL_PX = 12;
const CELL_GAP_PX = 2;

// ── AN EMPTY CELL IS NOT A PLACE TO GO ────────────────────────────────────
//
// A cell with a zero count is drawn — the wash at level 0 is the statement
// "nothing happened here" and the grid would have a hole in it otherwise — but
// it is not interactive. Selecting one filters the list to nothing; opening an
// empty month reveals a calendar of zeros where nothing can be clicked either
// (Miles, 2026-09-11: "i don't think we need to make the months with no events
// interactive, since they just show an empty timeline").
//
// ⚠️ THREE DIFFERENT REASONS A CELL REFUSES, and they are not the same reason:
//   • NOT IN THE LIFETIME — grid padding. The week grid pads out to whole
//     Monday-to-Sunday columns, the calendar to whole rows, the month matrix
//     to whole year rows. Nothing is drawn at all.
//   • OUTSIDE WHAT THE PAGE HOLDS. Its count is REAL and comes from the
//     opening balance or from a month the preload never reached; no loaded row
//     falls in it, so filtering to it would empty a list the page cannot
//     refill. ⚠️ A CALLER THAT PASSES `reachMonth` TAKES THIS REFUSAL AWAY:
//     the month is then read from the index as the page's own segment, which
//     is the second of the two paths decision 0019's 2026-09-25 amendment
//     rules. Without it the cell still refuses and the caption says so.
//   • EMPTY. In the lifetime, inside what the page holds, and nothing
//     happened. This one.
// A `pending` day (drawn, after the life's last event) is already covered by
// the first: it is outside the lifetime by construction.
const isEmpty = (count: number): boolean => count <= 0;
interface DayCell {
  /** Inside the drawn span and after the position's last event — an empty
   *  bucket, drawn, never selectable. See where it is set. */
  pending?: boolean;
  ts: number;
  count: number;
  inLifetime: boolean;
  /** Below a windowed page's cut: counted in the opening balance, and not
   *  filterable — no loaded row falls on this day. */
  summarised: boolean;
}

interface WeekColumn {
  weekIndex: number;
  monthLabel: string | null;
  days: DayCell[];
}

export interface TransactionHeatmapProps {
  events: { timestamp: number }[];
  /** Day buckets from a windowed page's OPENING BALANCE — every event below the
   *  cut, counted in the index and keyed by `Math.floor(ts / 86400) * 86400`,
   *  the same UTC day this grid buckets by. Merged into the density so a
   *  three-year position still reads as three years rather than as the fortnight
   *  its loaded rows cover.
   *
   *  Cells that fall entirely below the cut are NOT selectable. Selecting one
   *  would filter the loaded rows — all of which are at or after the cut — to
   *  nothing, and the reader would get an empty list under a grid showing
   *  density. An opening balance is brought forward, not re-filtered. */
  priorDays?: { key: string; count: number }[];
  /** Day buckets from the FOLDERS the index served — on the same UTC day key,
   *  and ABOVE the cut. Merged into the density for the same reason
   *  `priorDays` is: heat counts EVENTS, and a folder's members are events the
   *  page holds without listing. On the measured fixture they are 2,198 of
   *  2,967 served events over 81 days the grid would otherwise draw empty.
   *
   *  ⚠️ THESE ARE ORDINARY DAYS — ordinary shading, ordinary click, no
   *  "summarised" treatment (settled 2026-09-12). That is the whole reason
   *  they are a second input rather than more `priorDays`: a below-cut day is
   *  not selectable because no loaded row falls on it, while a folder day
   *  filters to the folder that covers it, which then opens to its members.
   *  They count towards where the WINDOW starts, so a day inside a folder
   *  older than the oldest ungrouped row is still selectable. */
  windowDays?: { key: string; count: number }[];
  /** Active date filter as [start, end] unix seconds. null = no filter. */
  value: [number, number] | null;
  onChange: (next: [number, number] | null) => void;
  /** Heading shown top-left. */
  title?: string;
  /** "weeks" (default) — the GitHub-style day grid (one column per week), best
   *  for short spans. "months" — a compact year-row × month-column matrix that
   *  never scrolls sideways, for long-lived positions spanning years. */
  layout?: "weeks" | "months";
  /** "card" (default) — its own bordered bg-raised panel with a title row and
   *  Reset, for sitting inline under a toolbar. "bare" — no panel, no title,
   *  no Reset: for a host that already supplies all three (the phone
   *  date-range sheet, whose pinned header carries them). The range label
   *  stays, since it is the grid's own reading of what is selected. "plain" —
   *  bare, and without the range label too: for the navigator, whose one
   *  heading row speaks for both of its tiers and would otherwise say the same
   *  range twice. */
  chrome?: "card" | "bare" | "plain";
  /** Draw only this span instead of the whole lifetime — the DETAIL half of
   *  the navigator's overview/detail pair (components/shared/timeline-navigator.tsx).
   *  Clamped to the lifetime, and ignored when the two do not overlap at all,
   *  so a grid is never drawn over a stretch the position did not live through.
   *
   *  It changes the RECTANGLE and nothing else: the density in a cell, the
   *  ramp it is scaled against and which cells may be selected are all what
   *  they were. A cell must not read one colour zoomed in and another zoomed
   *  out — that would make the two tiers disagree about the same month. */
  extent?: [number, number] | null;
  /** How a click on a cell is read.
   *
   *  "range" (default) — mousedown then drag selects a span, which is what
   *  this grid has always done and what the toolbar's inline copy still does.
   *
   *  "single" — ONE CELL, ONE SELECTION, and no drag at all. Clicking the
   *  selected cell again clears it. This is what the navigator asks for: a
   *  span of days is a thing the date range control already expresses, and a
   *  map whose only job is to get the reader to a day should not grow a second
   *  way to express it (Miles, 2026-09-11). */
  select?: "range" | "single";
  /** The WHOLE LIFE's events per UTC day, keyed by day start in seconds. Given,
   *  it replaces `events`/`priorDays`/`windowDays` as the months grid's counts
   *  and its extent, so the ramp is the life's whatever the page currently
   *  holds: a reader who has read one month from the index still sees the
   *  four years around it at the shades they had. `months` layout only. */
  lifeDays?: ReadonlyMap<number, number> | null;
  /** The span the rows ON THE PAGE cover, as unix seconds. A month that meets
   *  it is filtered locally, which is instant; a month outside it is a read.
   *  Defaults to "from the oldest loaded row onward", which is what a windowed
   *  page without a segment holds. */
  held?: [number, number] | null;
  /** Read that month from the index as the page's own segment. Given, a month
   *  outside `held` is selectable and its click comes here instead of through
   *  `onChange` (decision 0019, amendment 2026-09-25). */
  reachMonth?: ((monthIdx: number) => void) | null;
  /** The month the page holds as its segment, ringed like a selection so the
   *  grid says where the rows below came from. */
  currentMonth?: number | null;
  /** Press the ticked `currentMonth` again and this runs instead of a second
   *  read of it (ui-jobs 60). The grid cannot know what "clear" means for a
   *  month it did not filter to — the page read it as a segment and no
   *  `value` stands behind the tick — so the caller says. A SELECTED month
   *  (`value`) clears through `onChange(null)` as it always has; this is the
   *  other path's half of the same gesture. */
  clearPicked?: (() => void) | null;
}

// ── ⚠️ THE SIGNIFICANCE MARKS ARE GONE (2026-09-25, decision 0019) ─────────
//
// `CellMarks` drew three registers over a cell (a liquidation dot, a neutral
// underline where the owner had signed, a hollow ring for a market note) and
// `MarkLegend` named the ones a grid wore. Miles dropped all three everywhere,
// the `?folders=0` grid and the legend included: "the heatmap is enough and if
// users need to find a liquidation they can use the event filter". The
// builder behind them (`lib/shared/timeline-navigator.ts`) went with them, and
// so did the caption clause that said why a below-cut cell carried none. The
// DENSITY KEY stays: it is the key to the wash, not to a mark.

/** The density ramp, Less → More. A key to the wash, and the one piece of
 *  chrome a grid drawn as a TIER of something larger must not carry its own
 *  copy of — the navigator draws one under both of its grids instead
 *  (`chrome="plain"`), because two ramps under two grids read as two scales. */
export function DensityRamp() {
  return (
    <span data-density-key="" className="flex items-center gap-1 text-[10px] text-rb-500">
      <span>Less</span>
      {[0, 1, 2, 3, 4].map((level) => (
        <div key={level} className={`h-3 w-3 rounded-sm ${bucketClass(level)}`} />
      ))}
      <span>More</span>
    </span>
  );
}

/** The title row: title + range + Reset in a card, the range alone when bare,
 *  nothing at all when plain (the navigator's own heading speaks for both of
 *  its tiers). */
function HeatmapHeading({
  bare,
  plain,
  title,
  rangeLabel,
  value,
  onChange,
}: {
  bare: boolean;
  plain?: boolean;
  title: string;
  rangeLabel: string;
  value: [number, number] | null;
  onChange: (next: [number, number] | null) => void;
}) {
  if (plain) return null;
  if (bare) return <div className="mb-2 text-xs text-rb-500">{rangeLabel}</div>;
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-bold tracking-wide">{title}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-rb-500">{rangeLabel}</span>
        {value && (
          <button type="button" onClick={() => onChange(null)} className={RESET_LINK}>
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

const CARD_CHROME = "rounded-lg border border-rb-200/60 dark:border-rb-800/60 bg-raised p-3 select-none";
const BARE_CHROME = "select-none";

/** Dispatch on layout. The week grid is the default; the month grid is the
 *  compact form for multi-year histories.
 *
 *  ⚠️ NOTHING IN THE PRODUCT ASKS FOR "weeks" TODAY (2026-09-11). The toolbar's
 *  inline heatmap and the navigator panel both pass `layout="months"`, and the
 *  one caller that drew days — the navigator's day tier — was removed by
 *  decision (see timeline-navigator.tsx). The week grid is kept as the
 *  component's documented default rather than deleted, but read it as
 *  unexercised: `extent`, `pending` and `select="single"` on this arm have no
 *  live caller either, and a change to any of them is untested by anything on
 *  the page. */
export function TransactionHeatmap(props: TransactionHeatmapProps) {
  if (props.layout === "months") return <MonthsHeatmap {...props} />;
  return <WeeksHeatmap {...props} />;
}

function WeeksHeatmap({
  events,
  priorDays,
  windowDays,
  value,
  onChange,
  title = "Transaction Heatmap",
  chrome = "card",
  extent,
  select = "range",
}: TransactionHeatmapProps) {
  const single = select === "single";
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [hoverTs, setHoverTs] = useState<number | null>(null);

  const grid = useMemo(() => {
    if (events.length === 0 && (windowDays?.length ?? 0) === 0) return null;
    let minTs = Infinity;
    let maxTs = 0;
    const counts = new Map<number, number>();
    for (const e of events) {
      if (e.timestamp < minTs) minTs = e.timestamp;
      if (e.timestamp > maxTs) maxTs = e.timestamp;
      const dayTs = startOfUtcDay(e.timestamp);
      counts.set(dayTs, (counts.get(dayTs) ?? 0) + 1);
    }
    // The served FOLDERS' own days — above the cut, so they are part of the
    // window and are merged BEFORE `windowMinDay` is taken. A folder older than
    // the oldest ungrouped row would otherwise land below that line and draw as
    // summarised, which is exactly what it is not: its members are one tap away.
    for (const b of windowDays ?? []) {
      const ts = Number(b.key);
      if (!Number.isFinite(ts)) continue;
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
      counts.set(startOfUtcDay(ts), (counts.get(startOfUtcDay(ts)) ?? 0) + b.count);
    }
    if (!Number.isFinite(minTs) || maxTs === 0) return null;

    // A windowed page's opening balance, merged in on the same UTC day key. The
    // first LOADED day is where selection stops — see `priorDays`.
    const windowMinDay = startOfUtcDay(minTs);
    for (const b of priorDays ?? []) {
      const ts = Number(b.key);
      if (!Number.isFinite(ts)) continue;
      if (ts < minTs) minTs = ts;
      counts.set(startOfUtcDay(ts), (counts.get(startOfUtcDay(ts)) ?? 0) + b.count);
    }

    const lifeMinDay = startOfUtcDay(minTs);
    const lifeMaxDay = startOfUtcDay(maxTs);
    // The DRAWN span is the extent WHOLE — not the extent intersected with the
    // lifetime. A month opened in the navigator must look like a month: the
    // one the position is living through right now runs to its last day with
    // the rest drawn as empty, rather than stopping at today and leaving a
    // two-column stub that reads as a broken grid.
    //
    // An extent that misses the lifetime entirely falls back to the whole life
    // rather than to nothing — the reader is otherwise looking at a grid that
    // says nothing, and a map that can show nothing is worse than one that
    // keeps showing the position.
    const wantStart = extent ? startOfUtcDay(extent[0]) : lifeMinDay;
    const wantEnd = extent ? startOfUtcDay(extent[1]) : lifeMaxDay;
    const drawn = wantStart <= wantEnd && wantEnd >= lifeMinDay && wantStart <= lifeMaxDay;
    const minDay = drawn ? wantStart : lifeMinDay;
    const maxDay = drawn ? wantEnd : lifeMaxDay;
    // Snap the grid back to the Monday of `minDay`'s week and forward to the
    // Sunday of `maxDay`'s week so every column is a full 7-row stack.
    const gridStart = minDay - dayOfWeekMon0(minDay) * SECONDS_PER_DAY;
    const gridEnd = maxDay + (6 - dayOfWeekMon0(maxDay)) * SECONDS_PER_DAY;

    const totalDays = Math.round((gridEnd - gridStart) / SECONDS_PER_DAY) + 1;
    const totalWeeks = Math.round(totalDays / 7);
    const weeks: WeekColumn[] = [];
    for (let w = 0; w < totalWeeks; w++) {
      const days: DayCell[] = [];
      let monthLabel: string | null = null;
      for (let d = 0; d < 7; d++) {
        const ts = gridStart + (w * 7 + d) * SECONDS_PER_DAY;
        const date = new Date(ts * 1000);
        // Show the month name above the first column whose Monday falls in the
        // first week of that month — gives one label per month with no gaps.
        if (d === 0 && date.getUTCDate() <= 7) {
          monthLabel = MONTH_NAMES[date.getUTCMonth()];
        }
        const inLifetime = ts >= minDay && ts <= maxDay && ts >= lifeMinDay && ts <= lifeMaxDay;
        // A day of the OPEN MONTH that the position has not reached yet. It
        // draws as an empty bucket rather than as nothing, so a month opened
        // in the navigator reads as a whole month instead of stopping dead at
        // today — the same thing a contribution grid does with the rest of the
        // current week.
        //
        // Only AFTER the life, never before it. A day before the position's
        // first event drawn as an empty bucket would say the position existed
        // and did nothing, which is a claim about a position that was not
        // there; a day after its last event says nothing has happened yet,
        // which is what the page holds.
        const pending = extent != null && ts > lifeMaxDay && ts >= minDay && ts <= maxDay;
        days.push({ ts, count: counts.get(ts) ?? 0, inLifetime, pending, summarised: ts < windowMinDay });
      }
      weeks.push({ weekIndex: w, monthLabel, days });
    }

    return {
      weeks,
      gridStart,
      minDay,
      maxDay,
      windowMinDay,
      // The busiest day of the WHOLE LIFE, for the relative ramp below.
      maxCount: counts.size === 0 ? 0 : Math.max(...counts.values()),
      // Only the part of the opening balance the grid actually DRAWS earns the
      // caption. Zoomed into a span entirely at or after the cut there is no
      // summarised cell on screen, and the sentence would be pointing at
      // nothing.
      summarising: (priorDays?.length ?? 0) > 0 && minDay < windowMinDay,
    };
  }, [events, priorDays, windowDays, extent]);

  // End drag on global mouseup so dragging off the grid still finalises.
  useEffect(() => {
    if (dragStart === null) return;
    const onUp = () => setDragStart(null);
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [dragStart]);

  if (!grid) return null;

  const isDragging = dragStart !== null;
  // While dragging, show a live preview of the range derived from the cursor
  // so the user gets feedback before mouseup commits.
  const displayRange: [number, number] | null =
    isDragging && hoverTs !== null
      ? [Math.min(dragStart, hoverTs), Math.max(dragStart, hoverTs) + (SECONDS_PER_DAY - 1)]
      : value;

  const inSelection = (dayTs: number): boolean => {
    if (!displayRange) return false;
    const [a, b] = displayRange;
    return dayTs >= startOfUtcDay(a) && dayTs <= startOfUtcDay(b);
  };

  const onCellMouseDown = (cell: DayCell) => {
    if (!cell.inLifetime || cell.summarised || isEmpty(cell.count)) return;
    // One cell, one day, and the same cell again is the way back out. No drag
    // state is entered at all, so there is nothing for a stray mouseup to
    // finalise into a range the reader did not ask for.
    if (single) {
      onChange(inSelection(cell.ts) ? null : [cell.ts, cell.ts + (SECONDS_PER_DAY - 1)]);
      return;
    }
    setDragStart(cell.ts);
    setHoverTs(cell.ts);
    onChange([cell.ts, cell.ts + (SECONDS_PER_DAY - 1)]);
  };
  const onCellMouseEnter = (cell: DayCell) => {
    if (single || !cell.inLifetime || cell.summarised || isEmpty(cell.count)) return;
    setHoverTs(cell.ts);
    if (isDragging) {
      const a = Math.min(dragStart, cell.ts);
      const b = Math.max(dragStart, cell.ts);
      onChange([a, b + (SECONDS_PER_DAY - 1)]);
    }
  };

  const rangeLabel = displayRange
    ? `${fmtFullDate(displayRange[0])} – ${fmtFullDate(displayRange[1])}`
    : `${fmtFullDate(grid.minDay)} – ${fmtFullDate(grid.maxDay)}`;

  // Day-of-week labels drop in on rows 0, 2, 4, 6 (Mon, Wed, Fri, Sun) — the
  // others are blank to keep the column rhythm aligned with the cell grid.
  const dowLabels = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

  // ── WHICH RAMP THIS GRID IS ON
  //
  // Drawn on its own, a day grid uses the ABSOLUTE GitHub scale: five events
  // is a busy day and the top shade, which is the right reading of a personal
  // account and is what every existing weeks-layout heatmap in the product
  // means by a dark cell.
  //
  // Drawn with an `extent` it is the DETAIL half of a larger grid, and it
  // takes that grid's relative log ramp instead, scaled against the busiest
  // day of the whole life. Two reasons, and the second is the load-bearing
  // one: a position doing thirty events on a typical day paints every cell at
  // full strength on the absolute scale, so the wash carries no information at
  // all; and a detail view that coloured by a different rule from the map it
  // came out of would make the two disagree about the same stretch of time.
  const relative = extent != null;
  const levelOf = (count: number) => (relative ? relLevel(count, grid.maxCount) : absLevel(count));
  const shade = (count: number) => bucketClass(levelOf(count));

  /** One day cell. Extracted when the navigator's day tier drew the same cell
   *  at a different size; the tier is gone (2026-09-11) and the extraction is
   *  kept because one cell in one place is still easier to read than a cell
   *  inlined in a nest of grids. */
  const cellOf = (d: DayCell) => {
    // The ramp is the ramp on both sides of the cut — a summarised day's
    // density is as real as a loaded one's, and dimming it would claim the
    // position was quieter then. Only selectability differs, and the cursor
    // and tooltip carry it.
    const cls = d.inLifetime ? shade(d.count) : d.pending ? bucketClass(0) : "bg-transparent";
    const selectable = d.inLifetime && !d.summarised && !isEmpty(d.count);
    const selected = inSelection(d.ts) && selectable;
    const label = `${fmtFullDate(d.ts)} · ${d.count} event${d.count === 1 ? "" : "s"}`;
    return (
      <div
        key={d.ts}
        // The cell's own bucket, in seconds — what anything reading the page
        // rather than looking at it needs, so a check never has to parse the
        // tooltip's prose.
        data-cell-at={d.ts}
        // Whether this cell is a bucket of the position's own life or grid
        // padding — the week grid pads out to whole Monday-to-Sunday columns
        // and the month matrix to whole year rows, and a padding cell means
        // nothing. Stamped for anything reading the page rather than looking
        // at it, so a check never has to tell them apart by colour.
        data-cell-live={d.inLifetime ? "" : undefined}
        data-cell-pending={d.pending && !d.inLifetime ? "" : undefined}
        title={!d.inLifetime ? "" : d.summarised ? `${label} · in the opening balance` : label}
        onMouseDown={() => onCellMouseDown(d)}
        onMouseEnter={() => onCellMouseEnter(d)}
        className={`relative rounded-sm transition-colors ${cls} ${selected ? "ring-1 ring-teal-400 ring-offset-0" : ""} ${selectable ? "cursor-pointer" : ""}`}
        style={{ width: `${CELL_PX}px`, height: `${CELL_PX}px` }}
      />
    );
  };

  return (
    // `data-heatmap-grain` is the grid's own statement of what one cell means,
    // for anything reading the page rather than looking at it (the navigator
    // verifier). The shape alone does not say: a quiet position draws the same
    // rectangle at either grain.
    <div data-heatmap-grain="weeks" className={chrome === "card" ? CARD_CHROME : BARE_CHROME}>
      <HeatmapHeading
        bare={chrome !== "card"}
        plain={chrome === "plain"}
        title={title}
        rangeLabel={rangeLabel}
        value={value}
        onChange={onChange}
      />
      <div className="flex gap-2 overflow-x-auto text-[10px] text-rb-500">
        <div className={`flex shrink-0 flex-col ${relative ? "" : "pt-4"}`} style={{ rowGap: `${CELL_GAP_PX}px` }}>
          {dowLabels.map((label, i) => (
            <div key={i} className="leading-none" style={{ height: `${CELL_PX}px`, lineHeight: `${CELL_PX}px` }}>
              {label}
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0">
          {!relative && (
            <div className="flex" style={{ columnGap: `${CELL_GAP_PX}px`, marginBottom: `${CELL_GAP_PX}px` }}>
              {grid.weeks.map((w) => (
                <div
                  key={`m-${w.weekIndex}`}
                  className="text-[10px] text-rb-500 leading-none"
                  style={{ width: `${CELL_PX}px`, height: `${CELL_PX}px` }}
                >
                  {w.monthLabel ?? ""}
                </div>
              ))}
            </div>
          )}
          <div className="relative flex" style={{ columnGap: `${CELL_GAP_PX}px` }}>
            {grid.weeks.map((w) => (
              <div key={w.weekIndex} className="flex flex-col" style={{ rowGap: `${CELL_GAP_PX}px` }}>
                {w.days.map((d) => cellOf(d))}
              </div>
            ))}
          </div>
          {grid.summarising && (
            <div className="mt-2 text-[10px] text-rb-500">
              Days before {fmtFullDate(grid.windowMinDay)} are the opening balance — counted in the index, summarised
              rather than listed, and not filterable.
            </div>
          )}
          {chrome !== "plain" && (
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              {/* Legend: Less → More */}
              <div className="flex items-center gap-1 text-[10px] text-rb-500">
                {[0, 1, 2, 3, 5].map((c) => (
                  <Fragment key={c}>
                    {c === 0 && <span>Less</span>}
                    <div
                      className={`rounded-sm ${bucketColor(c)}`}
                      style={{ width: `${CELL_PX}px`, height: `${CELL_PX}px` }}
                    />
                    {c === 5 && <span>More</span>}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Month index helpers (UTC). A month is keyed by year*12 + month (0-based),
// the same key `lib/shared/timeline-segments.ts` reduces a life to, which is
// what makes a month the picker names and a cell in this grid the same cell.
export const monthStartTs = (idx: number): number => Math.floor(Date.UTC(Math.floor(idx / 12), idx % 12, 1) / 1000);
export const monthEndTs = (idx: number): number =>
  Math.floor(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 1) / 1000) - 1;
export const monthIdxOf = (ts: number): number => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

interface MonthCell {
  idx: number;
  count: number;
  inLifetime: boolean;
  /** Outside the span the loaded rows cover: its count is real and comes from
   *  the opening balance or from a month the preload never reached, and no
   *  loaded row falls in it. Either the page can READ it (`reachMonth`) or the
   *  cell refuses the click; filtering to it would empty the list. */
  summarised: boolean;
}

/** Compact heatmap: one row per year, one column per month. Bounded to 12
 *  columns so it never scrolls sideways no matter how many years a position has
 *  run.
 *
 *  A month click SELECTS. By default it takes a drag too, which is what the
 *  toolbar's inline copy does and has always done; `select="single"` gives one
 *  month at a time, and the same month again clears it.
 *
 *  ⚠️ It used to take an `onOpenMonth` as well, and a click then OPENED the
 *  month — the navigator drew that month's days underneath and the list did
 *  not move. Both the drill and the day tier were removed on 2026-09-11 by
 *  decision (Miles: "one grid, no drilling"; "it's the rows, not the map"),
 *  and the props went with them rather than being left for a caller that no
 *  longer exists. See components/shared/timeline-navigator.tsx. */
function MonthsHeatmap({
  events,
  priorDays,
  windowDays,
  lifeDays,
  held,
  reachMonth,
  currentMonth,
  clearPicked,
  value,
  onChange,
  title = "Transaction Heatmap",
  chrome = "card",
  extent,
  select = "range",
}: TransactionHeatmapProps) {
  const single = select === "single";
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const grid = useMemo(() => {
    // ── WHERE THE COUNTS COME FROM
    //
    // `lifeDays` given, they are the whole life and nothing the page currently
    // holds moves them: a reader who has read December 2024 from the index
    // still sees the years around it at the shades they had. Without it they
    // are reduced here from what the page holds, which is what every caller
    // did before the segment read and is what a `?folders=0` page still wants.
    if (lifeDays) {
      const counts = monthCounts(lifeDays);
      const live = [...counts.entries()].filter(([, c]) => c > 0).map(([idx]) => idx);
      if (live.length === 0) return null;
      const lifeMinIdx = Math.min(...live);
      const lifeMaxIdx = Math.max(...live);
      // What the page HOLDS, in months. Everything outside it is a read.
      const heldMinIdx = held ? monthIdxOf(held[0]) : lifeMinIdx;
      const heldMaxIdx = held ? monthIdxOf(held[1]) : lifeMaxIdx;
      const rows: { year: number; cells: MonthCell[] }[] = [];
      for (let y = Math.floor(lifeMinIdx / 12); y <= Math.floor(lifeMaxIdx / 12); y++) {
        const cells: MonthCell[] = [];
        for (let m = 0; m < 12; m++) {
          const idx = y * 12 + m;
          cells.push({
            idx,
            count: counts.get(idx) ?? 0,
            inLifetime: idx >= lifeMinIdx && idx <= lifeMaxIdx,
            summarised: idx < heldMinIdx || idx > heldMaxIdx,
          });
        }
        rows.push({ year: y, cells });
      }
      return {
        rows,
        minIdx: lifeMinIdx,
        maxIdx: lifeMaxIdx,
        maxCount: counts.size === 0 ? 0 : Math.max(...counts.values()),
        windowMinIdx: heldMinIdx,
        summarising: lifeMinIdx < heldMinIdx || lifeMaxIdx > heldMaxIdx,
      };
    }
    if (events.length === 0 && (windowDays?.length ?? 0) === 0) return null;
    let minTs = Infinity;
    let maxTs = 0;
    const counts = new Map<number, number>();
    for (const e of events) {
      if (e.timestamp < minTs) minTs = e.timestamp;
      if (e.timestamp > maxTs) maxTs = e.timestamp;
      const idx = monthIdxOf(e.timestamp);
      counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    // The served folders' days — above the cut, so merged before the line
    // below. See the weeks grid for why they are not `priorDays`.
    for (const b of windowDays ?? []) {
      const ts = Number(b.key);
      if (!Number.isFinite(ts)) continue;
      if (ts < minTs) minTs = ts;
      if (ts > maxTs) maxTs = ts;
      const idx = monthIdxOf(ts);
      counts.set(idx, (counts.get(idx) ?? 0) + b.count);
    }
    if (!Number.isFinite(minTs) || maxTs === 0) return null;
    // The first month that holds a LOADED row — everything before it is opening
    // balance, and selectable ends here.
    const windowMinIdx = monthIdxOf(minTs);
    for (const b of priorDays ?? []) {
      const ts = Number(b.key);
      if (!Number.isFinite(ts)) continue;
      if (ts < minTs) minTs = ts;
      const idx = monthIdxOf(ts);
      counts.set(idx, (counts.get(idx) ?? 0) + b.count);
    }
    const lifeMinIdx = monthIdxOf(minTs);
    const lifeMaxIdx = monthIdxOf(maxTs);
    // The drawn span — see the weeks grid above for why a missed extent falls
    // back to the whole life rather than to nothing.
    const clipStart = extent ? Math.max(monthIdxOf(extent[0]), lifeMinIdx) : lifeMinIdx;
    const clipEnd = extent ? Math.min(monthIdxOf(extent[1]), lifeMaxIdx) : lifeMaxIdx;
    const drawn = clipStart <= clipEnd;
    const minIdx = drawn ? clipStart : lifeMinIdx;
    const maxIdx = drawn ? clipEnd : lifeMaxIdx;
    const minYear = Math.floor(minIdx / 12);
    const maxYear = Math.floor(maxIdx / 12);
    const rows: { year: number; cells: MonthCell[] }[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      const cells: MonthCell[] = [];
      for (let m = 0; m < 12; m++) {
        const idx = y * 12 + m;
        cells.push({
          idx,
          count: counts.get(idx) ?? 0,
          inLifetime: idx >= minIdx && idx <= maxIdx,
          summarised: idx < windowMinIdx,
        });
      }
      rows.push({ year: y, cells });
    }
    // The ramp is scaled against the busiest month of the WHOLE LIFE, not of
    // the drawn span: a month must not darken because the reader zoomed in on
    // it, or the overview strip and this grid would disagree about the same
    // cell.
    const maxCount = Math.max(...counts.values());
    return {
      rows,
      minIdx,
      maxIdx,
      maxCount,
      windowMinIdx,
      summarising: (priorDays?.length ?? 0) > 0 && minIdx < windowMinIdx,
    };
  }, [events, priorDays, windowDays, lifeDays, held, extent]);

  useEffect(() => {
    if (dragStart === null) return;
    const onUp = () => setDragStart(null);
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [dragStart]);

  if (!grid) return null;

  const isDragging = dragStart !== null;
  const displayRange: [number, number] | null =
    isDragging && hoverIdx !== null
      ? [monthStartTs(Math.min(dragStart, hoverIdx)), monthEndTs(Math.max(dragStart, hoverIdx))]
      : value;

  const inSelection = (cell: MonthCell): boolean => {
    if (!displayRange) return false;
    return monthStartTs(cell.idx) <= displayRange[1] && monthEndTs(cell.idx) >= displayRange[0];
  };

  const onCellDown = (cell: MonthCell) => {
    if (!cell.inLifetime || isEmpty(cell.count)) return;
    // THE TICKED MONTH CLEARS (ui-jobs 60). First, before either path below:
    // the month the page is STANDING ON wears the tick with no `value` behind
    // it, so neither the reach branch (which would re-read it) nor the single
    // branch (which would filter to it) reads a second press as "put it back".
    // A month the FILTER ticked falls through to `isTheSelection`, which has
    // cleared on a second press since the grid was built.
    if (clearPicked && currentMonth != null && cell.idx === currentMonth) {
      clearPicked();
      return;
    }
    // ── THE TWO PATHS (decision 0019, amendment 2026-09-25) ──
    //
    // Where the loaded rows hold the month, a click FILTERS them, which is
    // instant and is what rails.finance has always done. Where they do not,
    // the page READS that month from the index as its own segment, which is a
    // request and costs one. A caller that offers no read leaves the cell
    // refusing, as it did before either path existed.
    if (cell.summarised) {
      if (reachMonth) reachMonth(cell.idx);
      return;
    }
    if (single) {
      // THIS month, not "a month the selection touches". Equality rather than
      // `inSelection`, so a click inside a typed span (Jan – Mar, click Feb)
      // narrows to the month clicked instead of clearing everything; only the
      // month that IS the selection clears on a second click.
      const isTheSelection = value != null && value[0] === monthStartTs(cell.idx) && value[1] === monthEndTs(cell.idx);
      onChange(isTheSelection ? null : [monthStartTs(cell.idx), monthEndTs(cell.idx)]);
      return;
    }
    setDragStart(cell.idx);
    setHoverIdx(cell.idx);
    onChange([monthStartTs(cell.idx), monthEndTs(cell.idx)]);
  };
  const onCellEnter = (cell: MonthCell) => {
    if (single || !cell.inLifetime || cell.summarised || isEmpty(cell.count)) return;
    setHoverIdx(cell.idx);
    if (isDragging) {
      const a = Math.min(dragStart, cell.idx);
      const b = Math.max(dragStart, cell.idx);
      onChange([monthStartTs(a), monthEndTs(b)]);
    }
  };

  const rangeLabel = displayRange
    ? `${fmtFullDate(displayRange[0])} – ${fmtFullDate(displayRange[1])}`
    : `${fmtFullDate(monthStartTs(grid.minIdx))} – ${fmtFullDate(monthEndTs(grid.maxIdx))}`;

  return (
    <div data-heatmap-grain="months" className={chrome === "card" ? CARD_CHROME : BARE_CHROME}>
      <HeatmapHeading
        bare={chrome !== "card"}
        plain={chrome === "plain"}
        title={title}
        rangeLabel={rangeLabel}
        value={value}
        onChange={onChange}
      />
      <div
        className="grid items-center gap-1 text-[10px] text-rb-500"
        style={{ gridTemplateColumns: "auto repeat(12, minmax(0, 1fr))" }}
      >
        <div />
        {MONTH_NAMES.map((m) => (
          <div key={m} className="text-center">
            {m}
          </div>
        ))}
        {grid.rows.map((row) => (
          <Fragment key={row.year}>
            <div className="pr-2 text-right tabular-nums">{row.year}</div>
            {row.cells.map((cell) => {
              // The ramp is the ramp on both sides of the cut: a summarised
              // month's density is as real as a loaded one's, and dimming it
              // would say the position was quieter then. What differs is only
              // whether the cell can be filtered to, which the cursor and the
              // tooltip carry.
              const cls = !cell.inLifetime ? "bg-transparent" : bucketClass(relLevel(cell.count, grid.maxCount));
              // One ring, and it says one thing: THE ROWS BELOW ARE THIS
              // CELL'S. That is the filter's selection where the page filtered
              // and the segment's month where it read, and the reader is
              // looking at the same list either way. A typed span rings every
              // month it covers, which is the same statement about more cells.
              const reachable = cell.summarised && reachMonth != null;
              const selectable = cell.inLifetime && !isEmpty(cell.count) && (!cell.summarised || reachable);
              const isCurrent = currentMonth != null && cell.idx === currentMonth;
              // The picked cell, either path — the one thing that needs to
              // read as PICKED rather than merely busy, since the wash
              // already carries a colour of its own. A plain ring in the
              // wash's own hue disappeared into a dark cell (Miles,
              // 2026-09-25); the ink ring and the tick are both in
              // `text-rb-500`, the grid's own label colour, which the wash
              // never uses.
              const picked = selectable && (inSelection(cell) || isCurrent);
              const label = `${MONTH_NAMES[cell.idx % 12]} ${Math.floor(cell.idx / 12)} · ${cell.count} event${cell.count === 1 ? "" : "s"}`;
              // The ticked cell says what a press on it DOES, since the Reset
              // that used to say it is gone (ui-jobs 60).
              const title = !cell.inLifetime
                ? ""
                : picked
                  ? `${label} · showing — press to clear`
                  : reachable
                    ? `${label} · read from the index`
                    : cell.summarised
                      ? `${label} · in the opening balance`
                      : label;
              return (
                // A REAL BUTTON, not a div with a mousedown (ui-jobs 60). The
                // panel's Reset is gone and the tick is the way back, so the
                // grid is now the only way to clear a month — and a control
                // the keyboard cannot reach would have left a reader who
                // filtered by tab and Enter with no way out of the filter.
                // `disabled` on the cells that already refused a click: they
                // never had a behaviour to lose, and this keeps them out of
                // the tab order rather than handing back thirty dead stops.
                <button
                  key={cell.idx}
                  type="button"
                  disabled={!selectable}
                  aria-label={label}
                  aria-pressed={selectable ? picked : undefined}
                  data-cell-at={monthStartTs(cell.idx)}
                  data-cell-live={cell.inLifetime ? "" : undefined}
                  // A cell whose click is a READ rather than a filter, and the
                  // month the page is standing on: what anything reading the
                  // page rather than looking at it needs to tell the two paths
                  // apart without parsing a tooltip.
                  data-cell-reach={reachable ? "" : undefined}
                  data-cell-current={isCurrent ? "" : undefined}
                  title={title}
                  // Mousedown is the pointer path (the range arm starts a drag
                  // on it); Enter and Space are the keyboard's. No onClick, so
                  // the two never both fire for one press.
                  onMouseDown={() => onCellDown(cell)}
                  onMouseEnter={() => onCellEnter(cell)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onCellDown(cell);
                  }}
                  // A selectable cell that is not the tick answers a hover with
                  // a light ring in the same ink, so the cells read as
                  // pressable; the tick keeps its own heavier one, and says in
                  // its tooltip that a press clears it.
                  className={`focus-ring relative h-5 w-full rounded-sm transition-colors ${cls} ${picked ? "ring-2 ring-rb-500" : selectable ? "hover:ring-1 hover:ring-rb-500" : ""} ${selectable ? "cursor-pointer" : ""}`}
                >
                  {picked && (
                    <Check
                      aria-hidden
                      size={10}
                      strokeWidth={3}
                      className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-rb-500"
                    />
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-rb-500">
        {grid.summarising ? (
          reachMonth ? (
            // The picker-inline review branch drops the sentence that stood
            // here (Miles, 2026-09-25): "A month the list does not hold is
            // read from the index when you pick it, which takes a moment."
            // The two paths still exist (`onCellDown` above) and the cell's
            // own title still says "read from the index"; only this line of
            // prose is gone.
            <span />
          ) : (
            <span>
              Months before {MONTH_NAMES[grid.windowMinIdx % 12]} {Math.floor(grid.windowMinIdx / 12)} are the opening
              balance — counted in the index, summarised rather than listed, and not filterable.
            </span>
          )
        ) : (
          <span />
        )}
        {chrome !== "plain" && <DensityRamp />}
      </div>
    </div>
  );
}
