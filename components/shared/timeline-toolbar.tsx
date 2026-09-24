"use client";

// TimelineToolbar — the shared control strip above a position timeline: an
// event count, a chronological sort flip, an event-type show/hide filter, an
// asset show/hide filter, a date-range (heatmap) toggle and the display "eye"
// menu — plus the heatmap itself when open. The asset control appears only
// where there is an asset axis to offer (a pooled lender's wallet touching
// more than one reserve); see getEventAssetKeys. Driven entirely by a
// useTimelineEvents() state object, so a page wires it in one line. Extracted
// from the per-protocol copies the Liquity and Aave detail pages inline; the
// chain-state tier (Morpho + MakerDAO) uses it directly. The copy-link
// control that puts the current VIEW on the clipboard (`tl.viewHref`) lives
// in the position card's Explanation pane now, not here — see `CopyViewLink`
// in `provenance-info-tabs.tsx`.

import { useEffect, useRef } from "react";
import { Clock, Coins, Wallet } from "lucide-react";
import { FilterDropdown, DisplaySettingsIcon, type FilterOption } from "@/components/shared/filter-dropdown";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { MobileSheet, MobileSheetFilterHeader } from "@/components/shared/mobile-sheet";
import { PHONE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import {
  useTimelineDisplay,
  type TimelineDisplayKey,
  type TimelineDisplayState,
} from "@/components/shared/timeline-display-context";
import { useTimelineValuesDisabled } from "@/lib/shared/header-values";
import {
  CTRL_GHOST,
  CTRL_OFF,
  CTRL_ON,
  CTRL_ON_ACCENT,
  CTRL_ON_HOVER,
  PILL_META,
  ctrlWaking,
} from "@/lib/shared/ui-grammar";
import { formatDate, formatDuration } from "@/lib/date";
import { usePreferences } from "@/lib/shared/preferences-context";
import { ratioLabel } from "@/lib/shared/ratio-format";
import { lifetimeFiguresKnown } from "@/lib/shared/timeline-opening-balance";
import { loadedDaysStatement, segmentStatement } from "@/lib/shared/timeline-segments";
import { TimelineNavigatorPanel } from "@/components/shared/timeline-navigator";
import type { MarketNote } from "@/lib/shared/market-note";
import { useHydrated } from "@/hooks/useHydrated";
import type { TimelineEventsState } from "@/hooks/useTimelineEvents";

/** Tenure-first activity eyebrow for a position timeline (the V4 spoke
 *  treatment): "Active since {date} · {tenure} · {since last activity} ago" —
 *  when the position started, how long it has run, how fresh the latest
 *  activity is, read off the captured event stream (any order — first/last are
 *  scanned, not assumed). A closed position reads "Opened" and measures tenure
 *  to its last activity instead of now.
 *
 *  "Since" is the first CAPTURED event. For a genesis-complete index that IS
 *  the position's start; where an index has a backfill floor (Aave V3), a
 *  position older than the floor reads from the floor — the same
 *  captured-history caveat the economics tower's lifetime layer states. */
export function TimelineActivityHeader({
  events,
  closed,
  firstAt,
  tenurePending,
}: {
  events: { timestamp: number }[];
  closed?: boolean;
  /** When the position actually STARTED, for a surface whose event list is a
   *  capped slice of a longer history. Without it the tenure is measured from
   *  the oldest event on screen, which on a wallet with thousands of them is
   *  not the oldest event. */
  firstAt?: number | null;
  /** True while the position's opening balance is still in flight, or failed.
   *  The eyebrow then states the tenure as an OMISSION rather than measuring it
   *  from the oldest event on screen: on a windowed page that event is the
   *  start of the last thousand, not the start of the position, and a date
   *  three years wrong reads exactly as confidently as a right one. The
   *  freshness pill stays — the NEWEST event is always in the window. */
  tenurePending?: boolean;
}) {
  if (events.length === 0) return null;
  let first = events[0].timestamp;
  let last = events[0].timestamp;
  for (const e of events) {
    if (e.timestamp < first) first = e.timestamp;
    if (e.timestamp > last) last = e.timestamp;
  }
  if (firstAt != null && firstAt > 0 && firstAt < first) first = firstAt;
  const now = Math.floor(Date.now() / 1000);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {tenurePending ? (
        <span className="text-muted-foreground">{closed ? "Opened" : "Active since"} —</span>
      ) : (
        <>
          <span className="text-foreground">
            {closed ? "Opened" : "Active since"} {formatDate(first)}
          </span>
          <span className={PILL_META}>{formatDuration(first, closed ? last : now)}</span>
        </>
      )}
      <span className={PILL_META}>
        <Clock size={12} />
        {formatDuration(last, now)} ago
      </span>
    </div>
  );
}

/** Which display flags a surface exposes in its eye-menu. */
export interface TimelineDisplayItem {
  key: TimelineDisplayKey;
  label: string;
  /** Keep `label` as declared. Only `showCollateralRatio` has a dynamic
   *  label (the reader's CR/LTV preference, for Liquity V2); an explorer whose
   *  chip states CR only sets this so its menu says what its chip says. */
  fixedLabel?: boolean;
}

/** The run-collapse toggle. Not part of any shared preset — ChainTruthTimeline
 *  appends it only on a page that groups in the browser (defines `runs`, and
 *  was not answered in folders — rails-ops decision 0021). */
export const COLLAPSE_RUNS_ITEM: TimelineDisplayItem = { key: "collapseRuns", label: "Collapse like events" };

/** Display flags the chain-state timeline (Morpho + MakerDAO) exposes — only the
 *  ones with a render path on these pared-down cards (no change/balance bars, no
 *  USD/ratio layers). Shared so the two can't drift. */
export const CHAIN_TRUTH_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimestamps", label: "Timestamps (UTC)" },
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showEventNumbers", label: "Event numbers" },
];

/** The chain-state items + the USD-values toggle — for the explorers whose
 *  index carries per-event oracle-at-block prices (Aave V3 + Spark, server
 *  mig 092): their detail grids render the after-balance USD chip, so the
 *  flag has a render path there. Order mirrors the V4 spoke menu (USD values
 *  before Event numbers). */
export const CHAIN_TRUTH_USD_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimestamps", label: "Timestamps (UTC)" },
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showUsdValues", label: "USD values" },
  { key: "showEventNumbers", label: "Event numbers" },
];

/** The Liquity V2 trove page's own display menu — its richer grammar (change
 *  bars, balance bars, the collateral-ratio chip) on top of the chain-truth
 *  base, in the V2 menu's original order. `showCollateralRatio`'s label is
 *  resolved dynamically below (Collateral Ratio vs Loan-to-Value, the user's
 *  ratio-mode preference) — the string here is just the CR-mode fallback.
 *  Collapse-runs is NOT listed: ChainTruthTimeline appends it itself whenever
 *  the page passes `runs`. */
export const LIQUITY_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimestamps", label: "Timestamps (UTC)" },
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showChangeBars", label: "Change bars" },
  { key: "showBalanceBars", label: "Balance bars" },
  { key: "showCollateralRatio", label: "Collateral Ratio" },
  { key: "showEventNumbers", label: "Event numbers" },
];

/** The Polaris CDP page's own display menu — the same six items as the Liquity
 *  V2 preset: every Polaris touch and liquidation row carries its resulting
 *  figures and the lag columns, so the change and balance bars have a render
 *  path, and the oracle-at-block lane prices the ratio chip. The ratio item
 *  keeps its label: the Polaris chip states CR only, never LTV, so the menu
 *  says what the chip says. No collapse item: the CDP timeline passes no
 *  `runs` (rails-ops TO-DO-polaris-v2-parity §1.4, measured 2026-09-10). */
export const POLARIS_DISPLAY_ITEMS: TimelineDisplayItem[] = [
  { key: "showTimestamps", label: "Timestamps (UTC)" },
  { key: "showTimelineValues", label: "Timeline values" },
  { key: "showChangeBars", label: "Change bars" },
  { key: "showBalanceBars", label: "Balance bars" },
  { key: "showCollateralRatio", label: "Collateral Ratio", fixedLabel: true },
  { key: "showEventNumbers", label: "Event numbers" },
];

/** The shared display "eye" menu — one FilterDropdown over a chosen subset of
 *  the timeline-display flags. Replaces the per-protocol TimelineDisplayToggle
 *  copies; callers pass only the flags that have a render path on their cards. */
export function TimelineDisplayMenu({ items }: { items: TimelineDisplayItem[] }) {
  const display = useTimelineDisplay() as TimelineDisplayState & Record<string, boolean>;
  const tvDisabled = useTimelineValuesDisabled();
  // Only the Liquity preset carries a `showCollateralRatio` whose label moves
  // with the reader's CR/LTV preference (ratioLabel) — every other item's
  // label is the fixed string the preset declares (`fixedLabel` on a ratio
  // item that states CR only, as Polaris's does).
  const { prefs } = usePreferences();
  const labelFor = (it: TimelineDisplayItem) =>
    it.key === "showCollateralRatio" && !it.fixedLabel ? ratioLabel(prefs.ratioMode) : it.label;
  const selected = new Set(items.filter((it) => display[it.key]).map((it) => it.key));
  const options: FilterOption[] = items.map((it) =>
    it.key === "showTimelineValues"
      ? { key: it.key, label: labelFor(it), disabled: tvDisabled.disabled, title: tvDisabled.reason }
      : { key: it.key, label: labelFor(it) },
  );
  return (
    <FilterDropdown
      label="Display"
      options={options}
      selected={selected}
      onSelect={() => {}}
      multi
      minimal
      align="right"
      variant="button"
      triggerIcon={<DisplaySettingsIcon size={16} />}
      onToggle={(key) => display.toggle(key as TimelineDisplayKey)}
    />
  );
}

export interface TimelineToolbarProps {
  /** False on a page whose months are the segment picker above the rows:
   *  the Date panel then keeps the typed spread alone (decision 0019,
   *  amendment 2026-09-24, rule 1). */
  navigatorGrid?: boolean;
  tl: TimelineEventsState;
  /** Display flags to expose in the eye-menu (only ones with a render path). */
  displayItems: TimelineDisplayItem[];
  /** Optional left-side eyebrow (e.g. "replayed from chain"). */
  leading?: React.ReactNode;
  /** Market notes: a pressed-state pill beside the eye menu, reading
   *  "Market notes · N" — N the count of note rows the page would show
   *  (historical anchored + live), whatever `marketNotesOn` currently is. Not
   *  rendered when 0 or undefined — a page with no notes gets no inert pill.
   *  Same visual grammar as the heatmap's Date button below: CTRL_GHOST at
   *  rest, CTRL_ON pressed, aria-pressed for the state. */
  marketNoteCount?: number;
  /** Whether note rows are currently shown — `showMarketNotes` in
   *  timeline-display-context.tsx. Ignored when `marketNoteCount` is 0. */
  marketNotesOn?: boolean;
  /** Flips `marketNotesOn`. Required together with `marketNoteCount` for the
   *  pill to render at all — a count with nothing to toggle would be inert. */
  onToggleMarketNotes?: () => void;
  /** The notes the page is showing, for the navigator panel's marks. Reduced
   *  in ChainTruthTimeline, where they are anchored, and passed here because
   *  the panel hangs off this strip's Date button. */
  navigatorNotes?: MarketNote[];
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
  const day = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const a = day(first);
  const b = day(last);
  return a === b ? a : `${a} to ${b}`;
}

/** The extent of the loaded rows in seconds, for the segment statement. */
function loadedExtent(tl: TimelineEventsState): { firstAt: number; lastAt: number } | null {
  let first = tl.sortedEvents.length ? tl.sortedEvents[0].timestamp : Infinity;
  let last = tl.sortedEvents.length ? tl.sortedEvents[tl.sortedEvents.length - 1].timestamp : -Infinity;
  if (tl.servedSpan) {
    first = Math.min(first, tl.servedSpan.firstAt);
    last = Math.max(last, tl.servedSpan.lastAt);
  }
  return Number.isFinite(first) ? { firstAt: first, lastAt: last } : null;
}

export function eventCountLine(tl: TimelineEventsState): string {
  const n = (v: number) => v.toLocaleString("en-US");
  const windowed = tl.historyWindow.state !== "whole";
  // A SEGMENT states its month and what of it is on the page, in time
  // (decision 0019, amendment 2026-09-24). The month's count is a fact the
  // life holds; what the page could carry is never a number here.
  if (tl.historyWindow.state === "span") {
    const span = tl.historyWindow.span;
    const statement = segmentStatement(span, loadedExtent(tl));
    if (!tl.isFiltered) return statement;
    const shownNow = `${tl.filteredCountIsFloor ? "at least " : ""}${n(tl.filteredCount)}`;
    const loaded = loadedDaysStatement(span, loadedExtent(tl));
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

export function TimelineToolbar({
  tl,
  displayItems,
  leading,
  marketNoteCount,
  marketNotesOn,
  onToggleMarketNotes,
  navigatorNotes,
  navigatorGrid = true,
}: TimelineToolbarProps) {
  // One option is not an axis — a single-reserve wallet on a multi-asset roster
  // would get a control whose every state shows the same list.
  const assetOptions = tl.assetOptions.length > 1 ? tl.assetOptions : [];
  // Same rule for counterparties — a wallet with one recipient never grows a
  // control whose every state shows the same address.
  const counterpartyOptions = tl.counterpartyOptions.length > 1 ? tl.counterpartyOptions : [];
  const dateActive = tl.dateRange !== null;
  // On a phone the panel is a live sheet rather than a dropdown — the same
  // register as the filter menus beside it.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const dateLabel = dateActive
    ? `${new Date(tl.dateRange![0] * 1000).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric" })} – ${new Date(
        tl.dateRange![1] * 1000,
      ).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric" })}`
    : "Date";
  const countLine = eventCountLine(tl);
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
  // of them in ChainTruthTimeline. It floats now, and the notes its marks read
  // travel here as a prop instead (`navigatorNotes`), because the strip owns
  // the button.
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
    <div ref={stripRef} className="relative space-y-3" {...ctrlWaking(hydrated)}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="min-w-0">{leading}</div>
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
            className="inline-flex items-center gap-2 basis-full sm:basis-auto whitespace-nowrap"
          >
            <span className="text-xs text-rb-500 tabular-nums">{countLine}</span>
          </span>
          {tl.eventOptions.length > 1 && (
            <FilterDropdown
              label="Types of event"
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
          {counterpartyOptions.length > 0 && (
            <FilterDropdown
              label="Addresses"
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
          <button
            type="button"
            data-date-control=""
            onClick={tl.toggleHeatmap}
            aria-pressed={datePanelOpen}
            // Sized and spaced exactly like the FilterDropdown triggers either
            // side of it (`h-7 gap-2 px-2.5 rounded-md text-xs`) — it opens a
            // panel the same way they do, so it is one of them, not a
            // one-off.
            className={`${CTRL_GHOST} h-7 gap-2 px-2.5 rounded-md text-xs ${
              dateActive ? CTRL_ON_ACCENT : datePanelOpen ? `${CTRL_ON} ${CTRL_ON_HOVER}` : CTRL_OFF
            }`}
            title={datePanelOpen ? "Hide the date span" : "Filter by a span of dates"}
          >
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
          {marketNoteCount != null && marketNoteCount > 0 && onToggleMarketNotes && (
            <button
              type="button"
              onClick={onToggleMarketNotes}
              aria-pressed={marketNotesOn}
              className={`${CTRL_GHOST} h-7 px-2.5 rounded-md text-xs ${marketNotesOn ? CTRL_ON : CTRL_OFF}`}
              title={marketNotesOn ? "Hide market notes" : "Show market notes"}
            >
              Market notes · {marketNoteCount.toLocaleString("en-US")}
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
          `overlay-panel` is the app's own floating surface — opaque in both
          themes, bordered and shadowed — because a translucent panel over
          moving rows is unreadable. z-40 clears the spine's own z-20. */}
      {tl.heatmapOpen &&
        (isPhone ? (
          <MobileSheet
            label="Date range"
            mode="live"
            onClose={tl.toggleHeatmap}
            header={
              <MobileSheetFilterHeader
                label="Date range"
                status={countLine}
                onReset={dateActive ? () => tl.setDateRange(null) : undefined}
              />
            }
          >
            <div className="px-4 pb-3">
              <TimelineNavigatorPanel tl={tl} notes={navigatorNotes} grid={navigatorGrid} inSheet />
            </div>
          </MobileSheet>
        ) : (
          <div data-nav-dropdown="" className="overlay-panel absolute inset-x-0 top-full z-40 mt-2 p-3">
            <TimelineNavigatorPanel tl={tl} notes={navigatorNotes} grid={navigatorGrid} />
          </div>
        ))}
    </div>
  );
}
