"use client";

// TimelineToolbar — the shared strip above a position timeline, in the
// listings' filter-bar style (ui-jobs 735): the heading line (the tenure, with
// Sync to chart, the 30-day projection's switch and Display at its right), then
// the pill row: one N1.10 pill per axis the history offers (Type, Asset,
// Version, Address; timeline-filter-bar.tsx), the Date pill where the page has
// a date axis (`tl.datesAxis`; a timeline its Lifetime flows chart draws tied
// to has none, `timelineDates` in lib/shared/flow-focus.ts), Clear all, and the count at the row's right end. Below sm the pills
// scroll sideways behind the filter sheet's button and the count takes the line
// under them. The Date pill opens the navigator panel (the month grid) under
// the strip. Driven by a useTimelineEvents() state object, so a page wires it
// in one line. The copy-link control that puts the current VIEW on the
// clipboard (`tl.viewHref`) is in the position card's Explanation pane — see
// `CopyViewLink` in `provenance-info-tabs.tsx`.

import { RevealTip } from "@/components/shared/reveal-tip";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { FilterDropdown, DisplaySettingsIcon, type FilterOption } from "@/components/shared/filter-dropdown";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useMountedNow } from "@/hooks/useMountedNow";
import {
  useTimelineDisplay,
  type TimelineDisplayKey,
  type TimelineDisplayState,
} from "@/components/shared/timeline-display-context";
import { CARD_INSET_START, ctrlWaking, INPLACE_TEXT, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import { formatDate, formatDateRange, formatDateShortYear, formatDayMonth, formatDuration } from "@/lib/date";
import { lifetimeFiguresKnown } from "@/lib/shared/timeline-opening-balance";
import { loadedDaysStatement, segmentStatement } from "@/lib/shared/timeline-segments";
import { TimelineNavigatorPanel, type TimelineMonthReach } from "@/components/shared/timeline-navigator";
import { useHydrated } from "@/hooks/useHydrated";
import { FilterPill, PILL_MUTED } from "@/components/shared/filter-bar/filter-pill";
import {
  clearTimelineFilters,
  draftAxesView,
  TimelineAxisPills,
  type TimelineFilters,
  TimelineFilterSheet,
  timelineFilterModel,
} from "@/components/shared/timeline-filter-bar";
import type { TimelineAxesView, TimelineEventsState } from "@/hooks/useTimelineEvents";
import { FigureSlot } from "@/components/shared/skeleton-card";

/** The muted text after a middle dot on the heading line, so only the filters
 *  below read as controls (rails-ops ui-jobs 227). */
const HEAD_META = "whitespace-nowrap text-rb-500";

// Which form the heading states, remembered per viewer across every position
// page (rails-ops ui-jobs 231): the start date ("Active since 31 Jan '25") or
// the tenure ("Active for 608 days"). Read through useSyncExternalStore with
// the date form as the server snapshot, so the server render and the
// hydrating render agree and a viewer who chose the tenure sees it straight
// after hydration.
const HEAD_FORM_KEY = "rails-ui-timeline-head-tenure";
const headFormListeners = new Set<() => void>();
function readHeadTenure(): boolean {
  try {
    return localStorage.getItem(HEAD_FORM_KEY) === "1";
  } catch {
    return false;
  }
}
function writeHeadTenure(on: boolean): void {
  try {
    if (on) localStorage.setItem(HEAD_FORM_KEY, "1");
    else localStorage.removeItem(HEAD_FORM_KEY);
  } catch {}
  for (const l of headFormListeners) l();
}
function subscribeHeadForm(onChange: () => void): () => void {
  headFormListeners.add(onChange);
  return () => {
    headFormListeners.delete(onChange);
  };
}
const dateFormOnServer = () => false;

/** The heading's one statement, a button that flips between its two forms,
 *  the whole line under the dotted line a tip label wears. */
function HeadToggle({ tenure, date, dur }: { tenure: boolean; date: React.ReactNode; dur: React.ReactNode }) {
  return (
    <button
      type="button"
      data-head-form={tenure ? "tenure" : "date"}
      aria-pressed={tenure}
      aria-label={tenure ? "Show the start date" : "Show how long"}
      onClick={() => writeHeadTenure(!tenure)}
      className="cursor-pointer rounded-sm focus-ring"
    >
      <span className="tip-underline">{tenure ? dur : date}</span>
    </button>
  );
}

/** Tenure-first activity heading for a position timeline: "Active since 31
 *  Jan '25", and on a click "Active for 608 days" — when the position started
 *  or how long it has run, read off the captured event stream (any order —
 *  first/last are scanned, not assumed). A closed position reads "Opened" and
 *  "Open for", measured to its last activity. How fresh the latest activity
 *  is belongs to the position card's header, which states it.
 *
 *  "Since" is the first CAPTURED event. For a genesis-complete index that IS
 *  the position's start; where an index has a backfill floor (Aave V3), a
 *  position older than the floor reads from the floor — the same
 *  captured-history caveat the economics tower's lifetime layer states. */
export function TimelineActivityHeader({
  events,
  folders,
  closed,
  firstAt,
  tenurePending,
  reopenedAt,
  lives,
  labelTenure,
}: {
  events: { timestamp: number }[];
  /** Each served folder's own first and last member, whole and unfiltered —
   *  the oldest (or newest) thing a position did can sit inside a folder
   *  rather than in `events`, so the tenure misses it unless every served
   *  folder's span is read alongside the events on screen. */
  folders?: readonly { firstAt: number; lastAt: number }[] | null;
  closed?: boolean;
  /** When the position actually STARTED, for a surface whose event list is a
   *  capped slice of a longer history. Without it the tenure is measured from
   *  the oldest event on screen, which on a wallet with thousands of them is
   *  not the oldest event. */
  firstAt?: number | null;
  /** True while the position's opening balance is still in flight, or failed.
   *  The heading then states the start as an OMISSION rather than measuring
   *  it from the oldest event on screen: on a windowed page that event is the
   *  start of the last thousand, not the start of the position, and a date
   *  three years wrong reads as confidently as a right one. */
  tenurePending?: boolean;
  /** Where the position closed and opened again under the same key (a
   *  LlamaLend borrower who repaid in full and borrowed later), when the open
   *  loan began: the heading then reads "Open again since {date} · first
   *  opened {date}". Unset changes nothing. */
  reopenedAt?: number | null;
  /** Where the account emptied and started again, each stretch it held
   *  something (unix seconds; `to` null while open): the heading then names
   *  every stretch and its length ("7 Oct - 31 Oct 2025 · 24 days · again 29
   *  Sep 2026 · 1 minute"). Drawn with two or more. Unset changes nothing. */
  lives?: readonly { from: number; to: number | null }[] | null;
  /** What an open position is doing, in place of "Active" ("in the pool":
   *  "In the pool since 31 Jan '25", "In the pool for 315 days"). */
  labelTenure?: string;
}) {
  // Null until the browser mounts: the server and the first browser render
  // agree on a placeholder, then the tenure is stated (no layout shift: the
  // placeholder is the same words, invisible).
  const clock = useMountedNow();
  const tenure = useSyncExternalStore(subscribeHeadForm, readHeadTenure, dateFormOnServer);
  if (events.length === 0 && !folders?.length) return null;
  let first = events.length ? events[0].timestamp : folders![0].firstAt;
  let last = first;
  for (const e of events) {
    if (e.timestamp < first) first = e.timestamp;
    if (e.timestamp > last) last = e.timestamp;
  }
  for (const f of folders ?? []) {
    if (f.firstAt < first) first = f.firstAt;
    if (f.lastAt > last) last = f.lastAt;
  }
  if (firstAt != null && firstAt > 0 && firstAt < first) first = firstAt;
  const now = clock ?? last;
  // A duration that reads the clock: the placeholder holds the width.
  const dur = (from: number, to: number | null) =>
    to == null && clock == null ? <FigureSlot ch={7} /> : formatDuration(from, to ?? now);
  if (!tenurePending && lives && lives.length > 1) {
    // Past three, the first and the last are named and the rest counted; the
    // tip lists every one.
    const shown = lives.length > 3 ? [lives[0], lives[lives.length - 1]] : lives;
    const between = lives.length - shown.length;
    const all = lives
      .map((l) =>
        l.to == null
          ? `since ${formatDate(l.from)} (${formatDuration(l.from, now)})`
          : `${formatDateRange(l.from, l.to)} (${formatDuration(l.from, l.to)})`,
      )
      .join("; ");
    return (
      <div
        className={`flex flex-wrap items-baseline gap-x-1 gap-y-1 ${SECTION_HEADING} text-rb-500`}
        data-timeline-lives={lives.length}
        title={clock == null ? undefined : `${lives.length} stretches, each starting from an empty account: ${all}`}
      >
        {shown.map((l, i) => {
          const sameDay = l.to != null && formatDate(l.from) === formatDate(l.to);
          const when =
            l.to == null ? `since ${formatDate(l.from)}` : sameDay ? formatDate(l.from) : formatDateRange(l.from, l.to);
          return (
            <span key={l.from} className="inline-flex items-baseline gap-1">
              <span>
                {i > 0 ? "again " : l.to == null ? "Active " : ""}
                {i === 0 && l.to != null ? when.charAt(0).toUpperCase() + when.slice(1) : when}
              </span>
              <span className={HEAD_META} data-prov-exempt="">
                · {dur(l.from, l.to)}
              </span>
              {i === 0 && between > 0 && (
                <span className={HEAD_META}>
                  · {between} more {between === 1 ? "stretch" : "stretches"}
                </span>
              )}
            </span>
          );
        })}
      </div>
    );
  }
  if (!tenurePending && !closed && reopenedAt != null && reopenedAt > first) {
    return (
      <div
        className={`flex flex-wrap items-baseline gap-x-1 gap-y-1 ${SECTION_HEADING} text-rb-500`}
        data-timeline-activity-head=""
      >
        <HeadToggle
          tenure={tenure}
          date={<>Open again since {formatDateShortYear(reopenedAt)}</>}
          dur={<>Open again for {dur(reopenedAt, null)}</>}
        />
        <span className={HEAD_META}>· first opened {formatDateShortYear(first)}</span>
      </div>
    );
  }
  const lead = labelTenure ? labelTenure.charAt(0).toUpperCase() + labelTenure.slice(1) : "Active";
  return (
    // data-prov-exempt: a span between two event timestamps ("40 days"),
    // timeline chrome the coverage tripwire reads as a figure.
    <div
      className={`flex flex-wrap items-baseline gap-x-1 gap-y-1 ${SECTION_HEADING} text-rb-500`}
      data-timeline-activity-head=""
      data-prov-exempt=""
    >
      {tenurePending ? (
        <span>{closed ? "Opened" : `${lead} since`} —</span>
      ) : (
        <HeadToggle
          tenure={tenure}
          date={
            <>
              {closed ? "Opened" : `${lead} since`} {formatDateShortYear(first)}
            </>
          }
          dur={
            <>
              {closed ? "Open" : lead} for {closed ? dur(first, last) : dur(first, null)}
            </>
          }
        />
      )}
    </div>
  );
}

/** Which display flags a surface exposes in its eye-menu. */
export interface TimelineDisplayItem {
  key: TimelineDisplayKey;
  label: string;
  /** Open a group of its own under a rule. */
  separatorBefore?: boolean;
}

/** The run-collapse toggle. Not part of any shared preset — ChainTruthTimeline
 *  appends it only on a page that groups in the browser (defines `runs`, and
 *  was not answered in folders — rails-ops decision 0021). */

/** The market-note item, under a rule after the rest (rails-ops TO-DO-ui-jobs
 *  item 118). ChainTruthTimeline appends it on a page that has notes. Notes
 *  are not events, so they stay out of the Type filter, the count and the
 *  exports; this is their only switch. */
export const MARKET_NOTE_ITEMS: TimelineDisplayItem[] = [
  { key: "showMarketNotes", label: "Market notes", separatorBefore: true },
];

/** "Transaction hashes": every family's number pill can show the short hash
 *  (event-number-pill.tsx, ui-jobs 294), so every preset carries it. */
export const TX_HASH_ITEM: TimelineDisplayItem = { key: "showTxHashes", label: "Transaction hashes" };

/** "Figures first": the default tab of every family's opened card
 *  (event-card.tsx, ui-jobs 370), so every preset carries it, last. */
export const FIGURES_FIRST_ITEM: TimelineDisplayItem = { key: "figuresFirst", label: "Figures first" };

/** Display flags the chain-state timeline exposes: the ones with a render path
 *  on every family's cards (Morpho, MakerDAO, Aave V3 + Spark, the Liquity
 *  forks, Liquity V1, Polaris). USD, timestamps and the spine's values always show, so
 *  Transaction hashes and Figures first are the items. ChainTruthTimeline appends Collapse-runs
 *  whenever the page passes `runs`. */
export const CHAIN_TRUTH_DISPLAY_ITEMS: TimelineDisplayItem[] = [TX_HASH_ITEM, FIGURES_FIRST_ITEM];

/** The shared display "eye" menu — one FilterDropdown over a chosen subset of
 *  the timeline-display flags. Replaces the per-protocol TimelineDisplayToggle
 *  copies; callers pass only the flags that have a render path on their cards. */
export function TimelineDisplayMenu({ items }: { items: TimelineDisplayItem[] }) {
  const display = useTimelineDisplay() as TimelineDisplayState & Record<string, boolean>;
  const selected = new Set(items.filter((it) => display[it.key]).map((it) => it.key));
  const options: FilterOption[] = items.map((it) => ({
    key: it.key,
    label: it.label,
    separatorBefore: it.separatorBefore,
  }));
  return (
    <FilterDropdown
      label="Display"
      anatomy="L1.9"
      options={options}
      selected={selected}
      onSelect={() => {}}
      multi
      minimal
      showLabel
      triggerTitle="Choose what each timeline row shows"
      align="right"
      variant="pill"
      triggerIcon={<DisplaySettingsIcon size={16} />}
      onToggle={(key) => display.toggle(key as TimelineDisplayKey)}
    />
  );
}

export interface TimelineToolbarProps {
  /** The second path a month click can take, on a page that can read a month
   *  from the index as its own segment (decision 0019, amendment 2026-09-25).
   *  Omitted, the grid filters the loaded rows and nothing else. */
  monthReach?: TimelineMonthReach;
  tl: TimelineEventsState;
  /** Display flags to expose in the eye-menu (only ones with a render path). */
  displayItems: TimelineDisplayItem[];
  /** Optional left-side eyebrow (e.g. "replayed from chain"). */
  leading?: React.ReactNode;
  /** A control beside Display, before it (the "Sync to chart" button). */
  beforeDisplay?: React.ReactNode;
  /** The 30-day projection's switch (ui-jobs 733), between beforeDisplay and
   *  Display: a display control, outside Clear all and the URL. */
  projection?: React.ReactNode;
  /** The count an unapplied view would give (ChainTruthTimeline's
   *  `countDraft`); the editors read "Apply" without it. */
  countDraft?: (view: TimelineAxesView) => { count: number; floor: boolean };
  /** A title on the count line, for a family whose count is a true but
   *  surprising number (see ChainTruthTimelineProps.countTooltip). Unset
   *  renders identically to today. */
  countTooltip?: string;
  /** Words after an unfiltered whole-history count (ChainTruthTimelineProps.countDetail). */
  countDetail?: string;
  /** A picture of the strip (the home page's live example): the leading words
   *  and the position's whole count, no controls. */
  still?: boolean;
}

/**
 * The count line, and the one place on this strip where two GRAINS meet.
 *
 * `useTimelineEvents` hands over two numbers that are deliberately not the same
 * kind of thing, and says so in its own comments:
 *   - `totalCount` = `openingCount + sortedEvents.length` — the POSITION's own
 *     event count, the rows before the cut included (the opening balance on the
 *     window arm, `olderCount` on the arms that trim server-side).
 *   - `filteredCount` = how many of the LOADED rows survive the filters. A
 *     filter does not re-cut the opening balance (a statement does not
 *     re-filter its brought-forward line), so this can only ever be the page's.
 *
 * ⚠️⚠️ Joining those two with the word "of" states a falsehood, and did until
 * 2026-08-31: the deepest Spark wallet renders 1,000 of its 28,179 events, and
 * hiding USDT — which the menu correctly reports as 14,559 events — read
 * "563 of 28,179", implying 27,616 events had been removed. The same line hid a
 * second one: in `pending`/`failed` the opening balance has not arrived, so
 * `openingCount` is 0 and `totalCount` collapses to the window's own 1,000 —
 * a window's count presented as the position's, the exact thing
 * `timeline-opening-balance.ts` forbids.
 *
 * So: a ratio is only ever printed between two counts of the SAME set. On a
 * cut page the unfiltered line is the one ratio that IS of one set — the
 * listed rows over the position's events — and reads "Showing 1,000 of 3,342
 * events" (rails-ops decision 0019, amended 2026-09-10: one cut of 1,000 on
 * every arm, the boundary card the only mechanism past it). Filtered, the
 * ratio is over the listed rows and the position's total stands BESIDE it.
 * "Listed" is the boundary card's own word for the drawn rows, so the two
 * surfaces agree.
 *
 *   whole history        3,342 events                    120 of 3,342 events
 *   cut, total known     Showing 1,000 of 3,342 events   Showing 120 of 1,000 listed · 3,342 events
 *   cut, total a floor   Showing 1,000 of at least 3,342 events
 *   cut, total pending   Showing 1,000 listed            Showing 120 of 1,000 listed
 *   grouped              Showing 942 rows of 106,518 events
 *
 * THE GROUPED LINE STATES ITS UNIT, because on those pages the two counts are
 * counts of DIFFERENT THINGS and the reader can see it: decision 0019's
 * evening amendment made the cut count ROWS, where a folder is one row
 * standing for up to a hundred events. "Showing 942 of 106,518 events" would
 * be false — 942 rows cover far more than 942 events — so the noun is named
 * on the left. Where grouping produced no folder at all the two counts are
 * the same set again and the line is exactly the one above it; the filtered
 * line is unchanged either way, because a filter narrows EVENTS and the
 * ratio it prints is over events on both sides.
 *
 * The position's total is a lifetime figure: on the window arm it is stated
 * only once the opening balance is in hand and never guessed at from the
 * window; on the trimmed arms it is known synchronously, "at least" where the
 * arm could only bound it (`olderCountIsFloor`).
 */
/** What state the count line is in, as two facts a machine can read.
 *
 *  A page mid-settle and a page settled both draw a list and both state a
 *  count; only the PROSE says which is which, and a reader that sniffs prose
 *  reads "Showing 1,004 listed" as a finding rather than as a page whose
 *  lifetime figures have not landed yet (§38, 2026-09-20: three checks of the
 *  served-folders arm failed that way under load). The count line and the
 *  markers the toolbar stamps beside it come from HERE, so the two cannot
 *  drift: what a verifier waits for and what a reader is told are one fact. */
export type EventCountState = {
  /** `known` — the position's lifetime figures are in hand; `pending` — the
   *  window's opening balance has not arrived, so the line can only state
   *  what is listed; `floor` — the arm could bound the total, not read it,
   *  and the line says "at least". */
  total: "known" | "pending" | "floor";
  /** `rows` where the index grouped something, so the two counts are counts
   *  of different things and the line names its noun; `events` otherwise. */
  unit: "rows" | "events";
  /** `floor` while the filtered numerator is still missing members of a
   *  folder the filter splits — they are being read, and the line says "at
   *  least"; `exact` otherwise, and always when nothing is filtered. */
  shown: "exact" | "floor";
};

export function eventCountState(tl: TimelineEventsState): EventCountState {
  const windowed = tl.historyWindow.state !== "whole";
  const totalKnown = windowed ? lifetimeFiguresKnown(tl.historyWindow) : true;
  const grouped = tl.servedRowCount != null && tl.servedRowCount !== tl.servedEventCount;
  return {
    total: !totalKnown ? "pending" : !windowed && tl.olderCountIsFloor ? "floor" : "known",
    unit: grouped ? "rows" : "events",
    shown: tl.isFiltered && tl.filteredCountIsFloor ? "floor" : "exact",
  };
}

/** The span the loaded rows cover, from the loose events and the served
 *  folders, in the line's own date register: "14 Nov 2025 to 24 Sep 2026".
 *  Null when nothing is loaded. */
function loadedSpanText(tl: TimelineEventsState): string | null {
  let first = tl.sortedEvents.length ? tl.sortedEvents[0].timestamp : Infinity;
  let last = tl.sortedEvents.length ? tl.sortedEvents[tl.sortedEvents.length - 1].timestamp : -Infinity;
  if (tl.servedSpan) {
    first = Math.min(first, tl.servedSpan.firstAt);
    last = Math.max(last, tl.servedSpan.lastAt);
  }
  if (!Number.isFinite(first)) return null;
  const day = (ts: number) => formatDate(ts);
  const a = day(first);
  const b = day(last);
  return a === b ? a : `${a} to ${b}`;
}

export function eventCountLine(tl: TimelineEventsState): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const windowed = tl.historyWindow.state !== "whole";
  // A SEGMENT states its month and what of it is on the page, in time
  // (decision 0019, amendment 2026-09-24). The month's count is a fact the
  // life holds; what the page could carry is never a number here.
  if (tl.historyWindow.state === "span") {
    const span = tl.historyWindow.span;
    if (!tl.isFiltered) return segmentStatement(span);
    const shownNow = `${tl.filteredCountIsFloor ? "at least " : ""}${n(tl.filteredCount)}`;
    const loaded = loadedDaysStatement(span);
    return `Showing ${shownNow} of ${span.month.label}${loaded ? `, ${loaded} loaded` : ""}`;
  }
  // Both halves of every ratio below count the loaded rows, so it is a true
  // one. `servedEventCount` and not `sortedEvents.length`, because on a
  // grouped page the folder members are drawn too and the list covers them.
  //
  // On a grouped page the FILTERED numerator counts folder members too: each
  // standing folder's share is read off its header where the header can say,
  // and off its members where it cannot (ChainTruthTimeline, via
  // `filteredEventCount` in lib/shared/timeline-folder-filter.ts). Until the
  // last of those members lands the figure is a floor and says "at least".
  // Before 2026-09-21 it counted the loose events alone, so a folder of four
  // supplies and ninety-six transfers stood under a supplies-only filter
  // without its four members joining the count — and every filter read low on
  // the families that serve folders (Moonwell Base 0x719eae70d4a83f35bf82a2740699f5db84be919d,
  // liquidations only: "21 of 2,407 events" beside 24 folders holding 596).
  const listed = tl.servedEventCount;
  const shown = `${tl.filteredCountIsFloor ? "at least " : ""}${n(tl.filteredCount)}`;
  // A server-trimmed list that carries no opening balance — the Base replays,
  // the vault window, a `limit` fetch. The whole total is known synchronously.
  const older = !windowed && tl.olderCount > 0;
  if (!windowed && !older) {
    const noun = tl.totalCount === 1 ? "event" : "events";
    return tl.isFiltered ? `${shown} of ${n(tl.totalCount)} ${noun}` : `${n(tl.totalCount)} ${noun}`;
  }
  // The three predicates come from `eventCountState`, so the line and the
  // markers stamped beside it state the same thing. Rows and events part
  // company only where the index actually grouped something — see the note
  // above.
  const state = eventCountState(tl);
  const totalKnown = state.total !== "pending";
  const atLeast = state.total === "floor" ? "at least " : "";
  // A WINDOWED page states the time its rows cover, never how many the
  // preload carries: the cut is a server guard on one answer, not a figure
  // for the reader (decision 0019, amendment 2026-09-24). "Showing 1,000 of
  // 3,342 events" and "Showing 942 rows of 106,518 events" both named it and
  // both went with that amendment.
  const loaded = loadedSpanText(tl);
  if (!tl.isFiltered) {
    if (!totalKnown) return loaded ? `Loaded ${loaded}` : `Showing ${n(listed)} listed`;
    const total = `${atLeast}${n(tl.totalCount)} events`;
    return loaded ? `${total} · loaded ${loaded}` : total;
  }
  const head = loaded ? `Showing ${shown} of ${loaded}` : `Showing ${shown} of ${n(listed)} listed`;
  return totalKnown ? `${head} · ${atLeast}${n(tl.totalCount)} events` : head;
}

// Tiny month-index arithmetic, deliberately NOT imported from
// transaction-heatmap.tsx: that module is the LAZY boundary (loaded only
// after a Date press, see timeline-navigator.tsx's own note), and this
// toolbar renders eagerly on every detail page. Importing even one named
// export risks the bundler keeping the whole heatmap component in the
// eager chunk. The three lines below mirror monthStartTs/monthEndTs/
// monthIdxOf there exactly; if those change, change these too.
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthStartOfIdx = (idx: number): number => Math.floor(Date.UTC(Math.floor(idx / 12), idx % 12, 1) / 1000);
const monthEndOfIdx = (idx: number): number => Math.floor(Date.UTC(Math.floor(idx / 12), (idx % 12) + 1, 1) / 1000) - 1;
const monthIdxOfTs = (ts: number): number => {
  const d = new Date(ts * 1000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** The Date button's words for a range: one calendar month reads as that
 *  month ("Jul 2023"), anything else as its two days ("1 Oct – 31 Oct"). */
export function dateRangeLabel(range: [number, number]): string {
  const idx = monthIdxOfTs(range[0]);
  return range[0] === monthStartOfIdx(idx) && range[1] === monthEndOfIdx(idx)
    ? `${MONTH_SHORT[idx % 12]} ${Math.floor(idx / 12)}`
    : `${formatDayMonth(range[0])} – ${formatDayMonth(range[1])}`;
}

export function TimelineToolbar({
  tl,
  displayItems,
  leading,
  beforeDisplay,
  projection,
  countDraft,
  countTooltip,
  countDetail,
  monthReach,
  still,
}: TimelineToolbarProps) {
  const dateActive = tl.dateRange !== null;
  // The second path (decision 0019, amendment 2026-09-25) sets no
  // `dateRange` at all — the page reads the month as its own segment
  // instead — so a picked month read that way leaves `dateActive` false.
  // The button needs the reach's own month too, or the Date button read
  // "Date" while the grid it opens stood on a month underneath it (Miles,
  // 2026-09-25).
  const segmentMonth = monthReach?.month ?? null;
  const filterActive = dateActive || segmentMonth != null;
  const monthLabel = (idx: number) => `${MONTH_SHORT[idx % 12]} ${Math.floor(idx / 12)}`;
  // On a phone the panel is a live sheet rather than a dropdown — the same
  // register as the filter menus beside it.
  const isPhone = useMediaQuery(PHONE_QUERY);
  // A direct filter that IS one calendar month reads as that month — "Jul
  // 2023" — the same as a segment read does, since the reader picked the same
  // kind of thing either path (`dateRangeLabel`).
  const dateLabel = dateActive
    ? dateRangeLabel(tl.dateRange!)
    : segmentMonth != null
      ? monthLabel(segmentMonth)
      : "Dates";
  // A still strip's rows are the newest few of the history, so it states the
  // whole count the page's strip states.
  const baseCountLine = still
    ? `${tl.totalCount.toLocaleString("en-US")} ${tl.totalCount === 1 ? "event" : "events"}`
    : eventCountLine(tl);
  const countLine =
    countDetail && !tl.isFiltered && tl.historyWindow.state === "whole" && tl.olderCount === 0
      ? `${baseCountLine}${countDetail}`
      : baseCountLine;
  const countState = eventCountState(tl);
  // Inert until this strip's handlers are attached. A detail page is the widest
  // window on the site — it carries the most JS, so it is the last thing to come
  // alive (measured 1.8s at 4× CPU on slow 4G).
  const hydrated = useHydrated();

  // The axes as the listings' pills (ui-jobs 735); see timeline-filter-bar.tsx.
  const model = timelineFilterModel(tl);
  // The editors' "Show 12": the list's count until a draft changes, then the
  // draft's by the applied count's rule (`countDraft`). "Apply" where a folder
  // the view splits is unread, so the figure would be a floor.
  const draftBase =
    countDraft && !tl.filteredCountIsFloor
      ? { total: tl.isFiltered ? tl.filteredCount : tl.servedEventCount, noun: "events" }
      : undefined;
  const countFor = countDraft
    ? (draft: TimelineFilters) => {
        const r = countDraft(draftAxesView(tl, draft));
        return r.floor ? Promise.reject(new Error("floor")) : r.count;
      }
    : undefined;
  const clearDate = () => {
    tl.setDateRange(null);
    monthReach?.onReset?.();
  };
  const axesSet = model.dimensions.filter((d) => d.get(model.filters).length > 0).length;
  const setCount = axesSet + (filterActive ? 1 : 0);
  const clearAll = () => {
    clearTimelineFilters(model);
    if (filterActive) clearDate();
  };
  // data-prov-exempt: the count line is an index row count ("180 events",
  // "12 of 340 events"), the "event numbers" class, not a chain-state figure.
  // Stamped here so a timeline nested inside a page-level receipts scope (the
  // Vaults position page) is not asked for a receipt for how many rows it
  // has. The data-timeline-* markers are the line's state, for anything
  // reading this page rather than looking at it (`eventCountState`).
  const countNode = (
    <span
      data-prov-exempt=""
      data-timeline-total={countState.total}
      data-timeline-unit={countState.unit}
      data-timeline-shown={countState.shown}
      data-anatomy="L1.2"
      className={`inline-flex items-center gap-2 whitespace-nowrap ${still ? CARD_INSET_START : ""}`}
    >
      {countTooltip ? (
        <RevealTip tip={countTooltip} className={`text-sm tabular-nums ${PILL_MUTED}`}>
          {countLine}
        </RevealTip>
      ) : (
        <span className={`text-sm tabular-nums ${PILL_MUTED}`}>{countLine}</span>
      )}
    </span>
  );

  // ── The date control ─────────────────────────────────────────────────────
  //
  // ONE CONTROL. This strip's Date button opens the NAVIGATOR PANEL — the
  // month matrix plus an editable date spread — as a dropdown the full width
  // of the timeline, floating over the rows.
  //
  // ⚠️ IT WAS `?nav=1` UNTIL 2026-09-11, and the flag is gone rather than
  // defaulted-on: a flag nobody can turn off is a branch that rots. What it
  // replaced was an INLINE heatmap that opened below the strip and pushed the
  // rows down, and that stood open for as long as a range was selected. Both
  // are deleted. One grammar, everywhere — the same thing the filter menus
  // beside it do, opened by a press and closed by one.
  //
  // The panel used to STAND above the rows permanently, mounted as a sibling
  // of them in ChainTruthTimeline. It floats now, and the second path a month
  // click can take travels here as a prop (`monthReach`), because the strip
  // owns the button.
  //
  // Opened only by a press: it covers the rows, and a panel that sprang open
  // at every selection would take the page away from a reader who had just
  // filtered it.
  const datePanelOpen = tl.heatmapOpen;

  // ── The dropdown's two ways out ──────────────────────────────────────────
  // A press anywhere outside this strip, and Escape. `stripRef` wraps the
  // whole strip rather than the button alone, so the button's own press is
  // "inside" and toggles once instead of closing and reopening in the same
  // gesture. Neither is armed on a phone: the panel is a MobileSheet there,
  // whose portal content renders under document.body — outside `stripRef`
  // entirely — so a press inside the sheet would read as a press outside.
  const stripRef = useRef<HTMLDivElement>(null);
  const dropdownOpen = tl.heatmapOpen && !isPhone;
  useEffect(() => {
    if (!dropdownOpen) return;
    const away = (e: PointerEvent) => {
      if (stripRef.current && !stripRef.current.contains(e.target as Node)) tl.toggleHeatmap();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") tl.toggleHeatmap();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
    // `tl.toggleHeatmap` is stable for a given hook instance; listing it keeps
    // the effect honest without re-arming on every render.
  }, [dropdownOpen, tl.toggleHeatmap]);

  const displayControls = !still && (beforeDisplay != null || projection != null || displayItems.length > 0) && (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {beforeDisplay}
      {/* The 30-day projection's switch (ui-jobs 733): outside Clear all and
          the URL, so it sits with the display controls. */}
      {projection}
      {displayItems.length > 0 && <TimelineDisplayMenu items={displayItems} />}
    </div>
  );

  return (
    <div ref={stripRef} className="relative space-y-3" data-anatomy="L1" {...ctrlWaking(hydrated)}>
      {/* The heading line (Miles, 18 Nov 2026): the leading words inset
          CARD_INSET_START at the left, the display controls at the right. */}
      {(leading != null || displayControls) && (
        <div className="flex items-center gap-2">
          <div className={`min-w-0 ${CARD_INSET_START}`} data-anatomy="L1.1">
            {leading}
          </div>
          {displayControls}
        </div>
      )}
      {still ? (
        countNode
      ) : (
        // The listings' pill row (N1, ui-jobs 735): [axis pills] [Date]
        // [Clear all] and the count at the right end. Below sm the pills
        // scroll sideways behind the Filters button, and Reset and the count
        // take the line under them, at its left as the listings set it.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <div className="relative max-sm:-mx-4 max-sm:min-w-0 max-sm:basis-[calc(100%+2rem)] sm:contents">
            <div
              className="flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:contents [&::-webkit-scrollbar]:hidden"
              data-pill-row=""
              data-anatomy="N1.2"
            >
              <TimelineFilterSheet model={model} count={draftBase} countFor={countFor} />
              <TimelineAxisPills model={model} count={draftBase} countFor={countFor} />
              {tl.datesAxis && (
                <FilterPill
                  name="Date"
                  anatomy="L1.7"
                  openData={{ "data-date-control": "" }}
                  state={filterActive ? "set" : "unset"}
                  locked={false}
                  label="Date"
                  value={dateLabel}
                  spoken={filterActive ? `Date ${dateLabel}` : "Add Date filter"}
                  expanded={datePanelOpen}
                  onOpen={tl.toggleHeatmap}
                  onRemove={clearDate}
                />
              )}
              <span className="w-6 shrink-0 sm:hidden" aria-hidden="true" />
            </div>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent sm:hidden"
              aria-hidden="true"
            />
          </div>
          <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 sm:min-h-10">
            {/* As the listings draw it (N1.13): from sm "Clear all" once two
                pills are set, below sm "Reset" once one is. */}
            {setCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className={`text-sm font-medium ${INPLACE_TEXT} shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${setCount < 2 ? "sm:hidden" : ""}`}
                data-pill-clear=""
                data-anatomy="L1.12"
              >
                <span className="sm:hidden">Reset</span>
                <span className="max-sm:hidden">Clear all</span>
              </button>
            )}
            <span className="min-w-0 sm:ml-auto">{countNode}</span>
          </div>
        </div>
      )}

      {/* THE NAVIGATOR PANEL — a dropdown, not a section. Absolutely
          positioned so it takes no height from the rows and `left-0 right-0`
          so it is the width of the TIMELINE rather than of the button it
          hangs from: the month matrix is a twelve-column grid and a
          button-width popover would make each month four pixels wide.
          z-40 clears the spine's z-20. */}
      {tl.datesAxis &&
        tl.heatmapOpen &&
        (isPhone ? (
          <MobileSheet
            label="Date range"
            mode="live"
            onClose={tl.toggleHeatmap}
            header={
              <MobileSheetFilterHeader
                label="Date range"
                status={countLine}
                // The sheet's own Reset, in the pinned header every filter
                // sheet carries, is the only Reset anywhere now (ui-jobs 60
                // took the panel's), so it has to clear a SEGMENT as well as a
                // filter. The tick clears on a phone too; this is the second
                // way back, not the only one.
                onReset={
                  dateActive || monthReach?.onReset
                    ? () => {
                        tl.setDateRange(null);
                        monthReach?.onReset?.();
                      }
                    : undefined
                }
              />
            }
          >
            <div className="px-4 pb-3">
              <TimelineNavigatorPanel tl={tl} reach={monthReach} onPicked={tl.toggleHeatmap} />
            </div>
          </MobileSheet>
        ) : (
          // Local review variant (picker-inline branch, Miles, 2026-09-25),
          // for comparison against the floating dropdown decision 0019
          // describes. In flow rather than `absolute`/`top-full`/`z-40`, so
          // the panel takes real height here and pushes the rows below it
          // down instead of floating over them. Same panel, same
          // `data-nav-dropdown` hook, same open/close state
          // (`tl.heatmapOpen`); only the positioning classes differ from the
          // dropdown it replaces for this review. Not a decision.
          //
          // No `onPicked` here (Miles, 2026-09-25): on this inline variant a
          // pick filters or reads the segment and the grid stays open, so
          // clicking through several months in a row costs one press each
          // rather than a reopen between them. It closes only on a second
          // press of the Date button (`tl.toggleHeatmap`, wired below) or
          // when Reset already closed it, which it did not before this
          // change either. The phone sheet keeps closing on pick.
          //
          // `bg-raised`, NOT `overlay-panel` (ui-jobs 60). `overlay-panel` is
          // the app's FLOATING surface and `app/globals.css` says so in the
          // rule's own comment: in dark it takes rb-900, near-black, chosen so
          // a popover lifts clearly off the rb-800 canvas. This picker does not
          // float — it opens in flow and pushes the rows below it down — so it
          // sits on the same raised surface the rest of the inline panels use
          // (the position card, the flows tower). That also retires the
          // `shadow-none!` this branch needed to cancel `overlay-panel`'s own
          // `shadow-xl`, and the border that went with the floating surface:
          // `bg-raised` carries neither.
          <div data-nav-dropdown="" data-anatomy="L1.8" className="mt-2 rounded-xl bg-raised p-3">
            <TimelineNavigatorPanel tl={tl} reach={monthReach} />
          </div>
        ))}
    </div>
  );
}
