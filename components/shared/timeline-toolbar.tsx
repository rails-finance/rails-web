"use client";

// TimelineToolbar — the shared control strip above a position timeline: an
// event count, a chronological sort flip, an event-type show/hide filter, an
// asset show/hide filter, a date-range (heatmap) toggle and the display "eye"
// menu — plus the heatmap itself when open. A page tied to its Lifetime
// flows chart has no date-range control (`tl.datesAxis`). The asset control appears only
// where there is an asset axis to offer (a pooled lender's wallet touching
// more than one reserve); see getEventAssetKeys. Driven entirely by a
// useTimelineEvents() state object, so a page wires it in one line. Extracted
// from the per-protocol copies the Liquity and Aave detail pages inline; the
// chain-state tier (Morpho + MakerDAO) uses it directly. The copy-link
// control that puts the current VIEW on the clipboard (`tl.viewHref`) lives
// in the position card's Explanation pane now, not here — see `CopyViewLink`
// in `provenance-info-tabs.tsx`.

import { RevealTip } from "@/components/shared/reveal-tip";
import { Fragment, useEffect, useRef, useSyncExternalStore } from "react";
import { CalendarRange, Coins, Layers, ListFilter, Wallet, X } from "lucide-react";
import { FilterDropdown, DisplaySettingsIcon, type FilterOption } from "@/components/shared/filter-dropdown";
import { actionNoun } from "@/lib/shared/event-action-nouns";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useMountedNow } from "@/hooks/useMountedNow";
import {
  useTimelineDisplay,
  type TimelineDisplayKey,
  type TimelineDisplayState,
} from "@/components/shared/timeline-display-context";
import {
  CARD_INSET_START,
  CTRL_GHOST,
  CTRL_OFF,
  CTRL_ON,
  CTRL_ON_ACCENT,
  CTRL_ON_HOVER,
  ctrlWaking,
} from "@/lib/shared/ui-grammar";
import { formatDate, formatDateRange, formatDateShortYear, formatDayMonth, formatDuration } from "@/lib/date";
import { lifetimeFiguresKnown } from "@/lib/shared/timeline-opening-balance";
import { loadedDaysStatement, segmentStatement } from "@/lib/shared/timeline-segments";
import { TimelineNavigatorPanel, type TimelineMonthReach } from "@/components/shared/timeline-navigator";
import { useHydrated } from "@/hooks/useHydrated";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";

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

/** The heading's one statement, a button that flips between its two forms. */
function HeadToggle({ tenure, date, dur }: { tenure: boolean; date: string; dur: React.ReactNode }) {
  return (
    <button
      type="button"
      data-head-form={tenure ? "tenure" : "date"}
      aria-pressed={tenure}
      aria-label={tenure ? "Show the start date" : "Show how long"}
      onClick={() => writeHeadTenure(!tenure)}
      className="cursor-pointer rounded-sm text-foreground focus-ring"
    >
      {tenure ? dur : date}
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
    to == null && clock == null ? <span className="invisible">00 days</span> : formatDuration(from, to ?? now);
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
        className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm"
        data-timeline-lives={lives.length}
        title={clock == null ? undefined : `${lives.length} stretches, each starting from an empty account: ${all}`}
      >
        {shown.map((l, i) => {
          const sameDay = l.to != null && formatDate(l.from) === formatDate(l.to);
          const when =
            l.to == null ? `since ${formatDate(l.from)}` : sameDay ? formatDate(l.from) : formatDateRange(l.from, l.to);
          return (
            <span key={l.from} className="inline-flex items-baseline gap-1">
              <span className="text-foreground">
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
      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm" data-timeline-activity-head="">
        <HeadToggle
          tenure={tenure}
          date={`Open again since ${formatDateShortYear(reopenedAt)}`}
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
      className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm"
      data-timeline-activity-head=""
      data-prov-exempt=""
    >
      {tenurePending ? (
        <span className="text-muted-foreground">{closed ? "Opened" : `${lead} since`} —</span>
      ) : (
        <HeadToggle
          tenure={tenure}
          date={closed ? `Opened ${formatDateShortYear(first)}` : `${lead} since ${formatDateShortYear(first)}`}
          dur={
            closed ? (
              <>Open for {dur(first, last)}</>
            ) : (
              <>
                {lead} for {dur(first, null)}
              </>
            )
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
export const COLLAPSE_RUNS_ITEM: TimelineDisplayItem = { key: "collapseRuns", label: "Collapse like events" };

/** The market-note items, under a rule after the rest (rails-ops TO-DO-ui-jobs
 *  item 118). ChainTruthTimeline appends them on a page that has notes. Notes
 *  are not events, so they stay out of Types of event, the count and the
 *  exports; this is their only switch. "Open all" is desktop's: a phone draws
 *  notes as rows in the list view and as markers with one open at a time in
 *  the spine view, so it gets the first item only. */
export const MARKET_NOTE_ITEMS: TimelineDisplayItem[] = [
  { key: "showMarketNotes", label: "Market notes", separatorBefore: true },
  { key: "openAllMarketNotes", label: "Open all market notes" },
];

/** "Transaction hashes": every family's number pill can show the short hash
 *  (event-number-pill.tsx, ui-jobs 294), so every preset carries it. */
export const TX_HASH_ITEM: TimelineDisplayItem = { key: "showTxHashes", label: "Transaction hashes" };

/** Display flags the chain-state timeline exposes: the ones with a render path
 *  on every family's cards (Morpho, MakerDAO, Aave V3 + Spark, the Liquity
 *  forks, Liquity V1). USD and timestamps always show, so Timeline values and
 *  Transaction hashes are the items. ChainTruthTimeline appends Collapse-runs
 *  whenever the page passes `runs`. */
export const CHAIN_TRUTH_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimelineValues", label: "Timeline values" },
  TX_HASH_ITEM,
];

/** The Polaris CDP page's display menu: the chain-truth base plus the
 *  Collateral Ratio switch for the header's ratio chip, priced by the
 *  oracle-at-block lane. The chip states CR only, never LTV, so the label is
 *  fixed. No collapse item: the CDP timeline passes no
 *  `runs` (rails-ops TO-DO-polaris-v2-parity §1.4, measured 2026-09-10). */
export const POLARIS_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showCollateralRatio", label: "Collateral Ratio" },
  TX_HASH_ITEM,
];

/** The shared display "eye" menu — one FilterDropdown over a chosen subset of
 *  the timeline-display flags. Replaces the per-protocol TimelineDisplayToggle
 *  copies; callers pass only the flags that have a render path on their cards. */
export function TimelineDisplayMenu({ items }: { items: TimelineDisplayItem[] }) {
  const display = useTimelineDisplay() as TimelineDisplayState & Record<string, boolean>;
  // "Open all market notes" reads ticked only while the markers are on, and
  // is greyed while they are off: there is nothing for it to open.
  const isOn = (key: TimelineDisplayKey) =>
    key === "openAllMarketNotes" ? display.showMarketNotes && display.openAllMarketNotes : display[key];
  const selected = new Set(items.filter((it) => isOn(it.key)).map((it) => it.key));
  const options: FilterOption[] = items.map((it) =>
    it.key === "openAllMarketNotes"
      ? {
          key: it.key,
          label: it.label,
          separatorBefore: it.separatorBefore,
          disabled: !display.showMarketNotes,
          title: display.showMarketNotes ? undefined : "Turn on market notes first",
        }
      : { key: it.key, label: it.label, separatorBefore: it.separatorBefore },
  );
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
      variant="button"
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
  /** A title on the count line, for a family whose count is a true but
   *  surprising number (see ChainTruthTimelineProps.countTooltip). Unset
   *  renders identically to today. */
  countTooltip?: string;
  /** Words after an unfiltered whole-history count (ChainTruthTimelineProps.countDetail). */
  countDetail?: string;
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

// ── The narrowing row (L2) ──────────────────────────────────────────────────
//
// One pill under the toolbar per filter narrowing the list, each with a ×
// that undoes that filter alone (the dropdown's own reset), beside the cut's
// chip where a cut stands. Display settings get none: they change how events
// read. ChainTruthTimeline draws the row (rails-ops detail-page-anatomy §3,
// "The narrowing row").

/** One filter pill: which axis, its words, and the reset it runs. */
export interface TimelineFilterPillSpec {
  axis: "action" | "asset" | "version" | "counterparty" | "date";
  /** "Only" or "Hiding", then the names; null for the date range. */
  verb: "Only" | "Hiding" | null;
  /** The names drawn on the pill: every one up to three, past that the
   *  first two, with `more` counting the rest. */
  names: string[];
  more: number;
  /** Every name, for the tooltip. */
  title: string;
  /** Each name is a token symbol and wears its chip icon. */
  chips?: boolean;
  /** The ×'s accessible name. */
  clearLabel: string;
  clear: () => void;
}

/** A type's pill word with the menu's label beside it where they differ: the
 *  menu says "Received", the pill says "transfers in". A label that is the
 *  noun's own verb in as many words ("Supply", "supplies") adds nothing and is
 *  left out. */
function actionTip(o: FilterOption, protocolKey: string): string {
  const noun = actionNoun(o.key, protocolKey, o.label);
  const label = o.label.toLowerCase();
  const n = Math.min(4, label.length);
  const sameWords = label.split(/\s+/).length === noun.split(/\s+/).length;
  return sameWords && label.slice(0, n) === noun.slice(0, n) ? noun : `${noun} (${o.label})`;
}

/** Name the shorter side of one axis: "Only a, b" when fewer are kept than
 *  hidden, "Hiding a, b" otherwise. Hidden keys the menu does not offer (a
 *  saved filter from another history) are not named. Null when the axis
 *  hides nothing it offers. */
function narrowing(
  options: FilterOption[],
  visible: Set<string>,
  name: (o: FilterOption) => string,
  /** The axis's plural, for a pill that hides every option ("Hiding all
   *  assets"). */
  noun: string,
  /** One name as the tooltip states it, where that adds to the pill's word. */
  tip: (o: FilterOption) => string = name,
): (Pick<TimelineFilterPillSpec, "verb" | "names" | "more" | "title"> & { every: boolean }) | null {
  const hidden = options.filter((o) => !visible.has(o.key));
  if (hidden.length === 0) return null;
  const kept = options.filter((o) => visible.has(o.key));
  if (kept.length === 0)
    return { verb: "Hiding", names: [`all ${noun}`], more: 0, title: `Hiding all ${noun}`, every: true };
  const only = kept.length < hidden.length;
  const shown = only ? kept : hidden;
  // Two options that read as one name (a plain and a compound menu item) are
  // named once; the tooltip lists every menu label under it.
  const groups = new Map<string, FilterOption[]>();
  for (const o of shown) {
    const n = name(o);
    groups.set(n, [...(groups.get(n) ?? []), o]);
  }
  const side = [...groups.keys()];
  const verb = only ? "Only" : "Hiding";
  const names = side.length > 3 ? side.slice(0, 2) : side;
  const tips = [...groups].map(([n, os]) => {
    if (os.length === 1) return tip(os[0]);
    const labels = [...new Set(os.map((o) => o.label))].filter((l) => l !== n);
    return labels.length ? `${n} (${labels.join(", ")})` : n;
  });
  return {
    verb,
    names,
    more: side.length - names.length,
    title: `${verb} ${tips.join(", ")}`,
    every: false,
  };
}

/** Every filter pill the toolbar's state calls for, in the toolbar's order. */
export function timelineFilterPills(tl: TimelineEventsState): TimelineFilterPillSpec[] {
  const pills: TimelineFilterPillSpec[] = [];
  const action = narrowing(
    tl.eventOptions,
    tl.visibleActionKeys,
    (o) => actionNoun(o.key, tl.protocolKey, o.label),
    "types of event",
    (o) => actionTip(o, tl.protocolKey),
  );
  if (action)
    pills.push({
      axis: "action",
      ...action,
      clearLabel: `Clear the filter: ${action.title}`,
      clear: tl.resetHiddenActions,
    });
  const asset = narrowing(tl.assetOptions, tl.visibleAssetKeys, (o) => o.label, "assets");
  if (asset)
    pills.push({
      axis: "asset",
      ...asset,
      chips: !asset.every,
      clearLabel: "Show every asset",
      clear: tl.resetHiddenAssets,
    });
  const version = narrowing(tl.versionOptions, tl.visibleVersionKeys, (o) => o.label, "versions");
  if (version)
    pills.push({ axis: "version", ...version, clearLabel: "Show every version", clear: tl.resetHiddenVersions });
  const counterparty = narrowing(tl.counterpartyOptions, tl.visibleCounterpartyKeys, (o) => o.label, "addresses");
  if (counterparty)
    pills.push({
      axis: "counterparty",
      ...counterparty,
      clearLabel: "Show every address",
      clear: tl.resetHiddenCounterparties,
    });
  if (tl.datesAxis && tl.dateRange) {
    const words = dateRangeLabel(tl.dateRange);
    pills.push({
      axis: "date",
      verb: null,
      names: [words],
      more: 0,
      title: `Events from ${formatDate(tl.dateRange[0])} to ${formatDate(tl.dateRange[1])}`,
      clearLabel: "Show every date",
      clear: () => tl.setDateRange(null),
    });
  }
  return pills;
}

/** The pill's shell, shared with the cut's chip: neutral ground, its words
 *  first, its × last. */
export const NARROWING_PILL = "inline-flex items-center rounded-full bg-rb-100 text-xs text-foreground dark:bg-rb-800";
/** The ×: a 44px target on a phone, the pill's own height from `sm`. */
export const NARROWING_PILL_X =
  "inline-flex min-h-11 min-w-9 cursor-pointer items-center justify-center rounded-r-full pl-0.5 pr-1.5 text-rb-500 transition-colors hover:bg-rb-200/60 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 sm:min-h-0 sm:min-w-0 sm:py-1 dark:hover:bg-rb-700/60";

const PILL_GLYPH: Record<TimelineFilterPillSpec["axis"], React.ReactNode> = {
  // The same glyphs as the controls they undo, so a pill points at its menu.
  action: <ListFilter size={12} aria-hidden />,
  asset: <Coins size={12} aria-hidden />,
  version: <Layers size={12} aria-hidden />,
  counterparty: <Wallet size={12} aria-hidden />,
  date: <CalendarRange size={12} aria-hidden />,
};

export function TimelineFilterPill({ pill }: { pill: TimelineFilterPillSpec }) {
  return (
    <span className={NARROWING_PILL} data-anatomy="L2.2" data-filter-pill={pill.axis}>
      <span
        className="inline-flex min-h-11 items-center gap-1.5 py-1 pl-2.5 pr-1.5 sm:min-h-0"
        title={pill.title}
        data-filter-pill-words=""
      >
        <span className="text-rb-500">{PILL_GLYPH[pill.axis]}</span>
        <span className="whitespace-nowrap">
          {pill.verb && `${pill.verb} `}
          {pill.names.map((n, i) => (
            <Fragment key={n}>
              {i > 0 && ", "}
              {pill.chips && (
                <span className="mr-1 inline-flex align-[-2px]">
                  <TokenChipIcon symbol={n} size={12} filterable={false} />
                </span>
              )}
              {n}
            </Fragment>
          ))}
          {pill.more > 0 && <span className="text-rb-500"> +{pill.more} more</span>}
        </span>
      </span>
      <button type="button" onClick={pill.clear} aria-label={pill.clearLabel} className={NARROWING_PILL_X}>
        <X className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}

export function TimelineToolbar({
  tl,
  displayItems,
  leading,
  countTooltip,
  countDetail,
  monthReach,
}: TimelineToolbarProps) {
  // One option is not an axis — a single-reserve wallet on a multi-asset roster
  // would get a control whose every state shows the same list.
  const assetOptions = tl.assetOptions.length > 1 ? tl.assetOptions : [];
  // Same rule for counterparties — a wallet with one recipient never grows a
  // control whose every state shows the same address.
  const counterpartyOptions = tl.counterpartyOptions.length > 1 ? tl.counterpartyOptions : [];
  // And for versions: a timeline of one version, which is every protocol but
  // an Alchemix position carrying its V2 history, grows no control.
  const versionOptions = tl.versionOptions.length > 1 ? tl.versionOptions : [];
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
  const baseCountLine = eventCountLine(tl);
  const countLine =
    countDetail && !tl.isFiltered && tl.historyWindow.state === "whole" && tl.olderCount === 0
      ? `${baseCountLine}${countDetail}`
      : baseCountLine;
  const countState = eventCountState(tl);
  // Inert until this strip's handlers are attached. A detail page is the widest
  // window on the site — it carries the most JS, so it is the last thing to come
  // alive (measured 1.8s at 4× CPU on slow 4G).
  const hydrated = useHydrated();

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

  return (
    <div ref={stripRef} className="relative space-y-3" data-anatomy="L1" {...ctrlWaking(hydrated)}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        {/* Inset to the cards' content line (CARD_INSET_START); the controls
            stay on the page edge. */}
        <div className={`min-w-0 ${CARD_INSET_START}`} data-anatomy="L1.1">
          {leading}
        </div>
        {/* Below sm the count takes a row of its own above the controls — on a
            phone it used to wrap mid-figure (Miles, 2026-09-02). From sm up it
            is the first item of the one control row, as before. */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* data-prov-exempt: the count line is an index row count ("180
              events", "Showing 1,000 of 3,942 events"), the "event numbers"
              class, not a chain-state figure. Stamped here so a timeline nested inside a
              page-level receipts scope (the Vaults position page) is not asked
              for a receipt for how many rows it has. */}
          {/* The line's own state, for anything reading this page rather than
              looking at it: `pending` says the lifetime figures have not
              landed and the prose can only state what is listed. See
              `eventCountState`. */}
          <span
            data-prov-exempt=""
            data-timeline-total={countState.total}
            data-timeline-unit={countState.unit}
            data-timeline-shown={countState.shown}
            data-anatomy="L1.2"
            className="inline-flex items-center gap-2 basis-full sm:basis-auto whitespace-nowrap"
          >
            {countTooltip ? (
              <RevealTip tip={countTooltip} className="text-xs text-rb-500 tabular-nums">
                {countLine}
              </RevealTip>
            ) : (
              <span className="text-xs text-rb-500 tabular-nums">{countLine}</span>
            )}
          </span>
          {tl.eventOptions.length > 1 && (
            <FilterDropdown
              label="Types of event"
              anatomy="L1.3"
              options={tl.eventOptions}
              selected={tl.visibleActionKeys}
              onSelect={() => tl.resetHiddenActions()}
              multi
              variant="button"
              align="right"
              // On a phone the sheet covers this strip, so the count that
              // answers each tap rides inside it (Miles, 2026-09-02).
              sheetStatus={countLine}
              onToggle={(act) => tl.toggleHiddenAction(act)}
            />
          )}
          {assetOptions.length > 0 && (
            <FilterDropdown
              label="Assets"
              anatomy="L1.4"
              options={assetOptions.map((o) => ({
                ...o,
                icon: <TokenChipIcon symbol={o.key} size={16} filterable={false} />,
              }))}
              selected={tl.visibleAssetKeys}
              onSelect={() => tl.resetHiddenAssets()}
              multi
              variant="button"
              align="right"
              // Symbols are names, not prose — wstETH must not read "Wsteth".
              verbatimLabels
              // A coin stack, not the shared list-filter glyph: at rest both
              // this and the event-type control read "All", and with the same
              // icon there would be nothing on the closed button to tell a
              // reader which one narrows what.
              triggerIcon={<Coins size={12} />}
              sheetStatus={countLine}
              onToggle={(sym) => tl.toggleHiddenAsset(sym)}
            />
          )}
          {versionOptions.length > 0 && (
            <FilterDropdown
              label="Versions"
              anatomy="L1.5"
              options={versionOptions}
              selected={tl.visibleVersionKeys}
              onSelect={() => tl.resetHiddenVersions()}
              multi
              variant="button"
              align="right"
              // "V2" is a name, not prose.
              verbatimLabels
              triggerIcon={<Layers size={12} />}
              sheetStatus={countLine}
              onToggle={(v) => tl.toggleHiddenVersion(v)}
            />
          )}
          {counterpartyOptions.length > 0 && (
            <FilterDropdown
              label="Addresses"
              anatomy="L1.6"
              options={counterpartyOptions}
              selected={tl.visibleCounterpartyKeys}
              onSelect={() => tl.resetHiddenCounterparties()}
              multi
              variant="button"
              align="right"
              // Addresses are monospace-shortened, not prose — the same
              // verbatim rule the asset control uses for symbols.
              verbatimLabels
              triggerIcon={<Wallet size={12} />}
              sheetStatus={countLine}
              onToggle={(addr) => tl.toggleHiddenCounterparty(addr)}
            />
          )}
          {/* No Dates on a page tied to its Lifetime flows chart
              (`tl.datesAxis`): the chart's scrubber and "Show timeline to {date}"
              navigate it by the day. */}
          {tl.datesAxis && (
            <button
              type="button"
              data-date-control=""
              data-anatomy="L1.7"
              onClick={tl.toggleHeatmap}
              aria-pressed={datePanelOpen}
              // Sized and spaced exactly like the FilterDropdown triggers either
              // side of it (`h-7 gap-2 px-2.5 rounded-md text-xs`) — it opens a
              // panel the same way they do, so it is one of them, not a
              // one-off.
              className={`${CTRL_GHOST} h-7 gap-2 px-2.5 rounded-md text-xs ${
                filterActive ? CTRL_ON_ACCENT : datePanelOpen ? `${CTRL_ON} ${CTRL_ON_HOVER}` : CTRL_OFF
              }`}
              title={datePanelOpen ? "Hide the date span" : "Filter by a span of dates"}
            >
              <CalendarRange size={12} aria-hidden />
              {dateLabel}
              {/* The same chevron the event-type, asset and address triggers
                carry, turning over when the panel is open. Without it a button
                reading "1 Oct – 31 Oct" is a label, and nothing on it says a
                click opens anything. */}
              <svg
                data-date-chevron=""
                aria-hidden
                width={10}
                height={10}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`ml-auto transition-transform ${datePanelOpen ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
          <TimelineDisplayMenu items={displayItems} />
        </div>
      </div>

      {/* THE NAVIGATOR PANEL — a dropdown, not a section. Absolutely
          positioned so it takes no height from the rows and `left-0 right-0`
          so it is the width of the TIMELINE rather than of the button it
          hangs from: the month matrix is a twelve-column grid and a
          button-width popover would make each month four pixels wide.
          z-40 clears the spine's own z-20. */}
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
