"use client";

// useTimelineEvents — the shared event pipeline behind a position timeline:
// chronological sort, type-level show/hide, asset-level show/hide, and
// date-range filtering, plus the per-position UI state (hidden action types,
// hidden assets) persisted to localStorage. Generalizes the
// memo chain the Liquity / Aave detail pages hand-roll, so the chain-state tier
// (Morpho + MakerDAO) gets the same tooling from one call. Pass the raw events and a stable `storageKey` (per position)
// plus the `protocolKey` used by the demoted/default-hidden registries.
//
// The VIEW — everything that decides WHAT is on the page — also round-trips
// through the URL, client-side, house-wide, with no per-page wiring:
//
//   ?hide=op1,op2               hidden event types
//   ?hideAssets=USDT,WETH       hidden assets
//   ?hideAddresses=0xab…,0xcd…  hidden counterparties
//   ?from=2025-01-01&to=2025-03-31   date range, UTC calendar days inclusive
//
// Every axis is written as what is HIDDEN, never what is shown: a list of
// hidden keys is the state itself, applies unchanged when a deeper read adds
// rows the sender never saw, and reads as the same act the menus perform. The
// date range is written as days because that is what the heatmap selects —
// a day cell is [00:00:00, 23:59:59] UTC and a month cell is its first day to
// its last — so the two forms round-trip exactly. Display preferences (the eye
// menu) never ride a link: how someone likes reading a timeline is theirs.
//
// ORDER IS NOT AN AXIS. Every timeline reads newest-first, and there is no
// control to flip it (Miles, 2026-09-12). The oldest-first arm was not a
// second way of reading the same list: on a position over the window cut it
// began at the oldest of the newest 1,000 — a point in the middle of a life,
// offered as its beginning — and everything that stands at the bottom of the
// list (the tip's pulsing dot, the live market-note rows, the stale-tip glyph)
// waited on `!hasMore`, so none of it drew until the reader had paged to the
// end. Reading a stretch forwards is the DATE RANGE's job: pick a month, get a
// short list. `?order=` is retired and swept out of any inherited link by
// `writeViewParams`; the markdown exports still render ascending, which is
// why `anchorMarketNotes` keeps its direction parameter.
//
// SERVED FOLDERS (decision 0019's evening amendment). Two families — SparkLend
// and Aave V3 — can ask the index for their history as ROWS: repetitive
// stretches arrive as folders carrying their members' aggregate, ungrouped
// events arrive as themselves. When a page passes `servedRows`, three things
// here change and nothing else does:
//
//   • NUMBERING COMES OFF THE WIRE, not off array position. A served list has
//     GAPS — a folder stands for up to ~100 events — so numbering by index
//     would under-count every row below the first folder, and decision 0019 §3
//     ("counts and numbering are literal, everywhere") is what would break.
//     The walk seeds from `totalEvents − eventsServed + 1` and snaps to each
//     folder's own `ordinalFirst`, which is the wire's authority.
//   • A FOLDER PASSES FILTERING WHOLE, never partly. Its header states a Σ
//     over ALL its members, so a folder whose members were half removed
//     elsewhere would be a header counting rows the page had hidden. It is
//     admitted when the filter admits ANY of the kinds in its `counts`, and
//     hidden only when it admits none.
//   • THE FOLDERS' OWN DAY HISTOGRAM is published (`folderDays`). The activity
//     map buckets the events on the page, and a folder's members are not among
//     them — so the density of a day whose events all sit inside folders comes
//     off the wire instead. Heat counts EVENTS, which makes the map invariant
//     to grouping: the same position draws the same heatmap with folders on and
//     with folders off.
//
// `sortedEvents` keeps its name and keeps holding EVENTS ONLY — pinned mode and
// the `?at=` resolver both search it, and a folder is not an event. The
// interleaved list is `displayedRows`.
//
// Read once on mount (after the localStorage restore, so a URL param wins over
// a saved preference for that load) and written back with history.replaceState
// after the visitor's first live toggle on ANY of these axes. Deliberately NOT
// next/navigation's useSearchParams — that forces a Suspense boundary that
// duplicates the hydrated subtree on some routes (see
// lib/shared/use-url-search-params.ts); window.location + replaceState
// sidesteps it, same as that listing driver. Nothing is written before a
// toggle: a visitor who never touches the toolbar never has their saved
// preference silently pasted into the address bar. That silence is about the
// ADDRESS BAR — `viewHref()` composes the full current view into a link on
// demand for the toolbar's copy-link control, which is an explicit share act
// and works on a load where nothing was toggled. The `initialHidden` prop
// (below) is a separate, stronger override — a pinned embed view — and opts
// out of both the URL read of `hide` and the write-back.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import {
  getEventActionKey,
  getEventAssetKeys,
  getEventCounterpartyKeys,
  actionLabel,
  DEMOTED_ACTIONS,
  DEFAULT_HIDDEN_ACTIONS,
} from "@/lib/shared/event-filter-helpers";
import { shortAddr } from "@/lib/shared/format-event";
import type { FilterOption } from "@/components/shared/filter-dropdown";
import {
  seedCounts,
  WHOLE_HISTORY,
  type OpeningBucket,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import type { ServedFolder, ServedTimelineRow } from "@/lib/shared/timeline-folder";
import { folderDays as foldersByDay } from "@/lib/shared/timeline-folder-reductions";
import { folderAdmits, folderMatchCount, type FolderFilterAxes } from "@/lib/shared/timeline-folder-filter";

/** One row of a SERVED timeline in display order: an event (with its index in
 *  `displayedEvents`, for the date prefix and the spine flags) or a folder the
 *  index grouped. Only ever non-empty on a page that passed `servedRows` — the
 *  fifteen families that still group client-side never see it. */
export type DisplayedTimelineRow =
  | { kind: "event"; event: BaseActivityEvent; flatIdx: number }
  | {
      kind: "folder";
      folder: ServedFolder;
      flatIdx: number;
      /** How many of its members the page's filters admit, read off the
       *  folder's header — its `count` when nothing is filtered — or NULL
       *  where the header cannot say and the members have to be read
       *  (lib/shared/timeline-folder-filter.ts). */
      matched: number | null;
    };

export interface TimelineEventsState {
  /** Events oldest→newest, the canonical order for numbering + deltas. */
  sortedEvents: BaseActivityEvent[];
  /** Type-filtered (pre-date) — what the heatmap buckets. */
  visibleEvents: BaseActivityEvent[];
  /** Final list in display order — newest first, narrowed by the filters and
   *  the date range. */
  displayedEvents: BaseActivityEvent[];
  /** The interleaved list in display order — events and the folders the index
   *  served, one entry per ROW the reader scrolls. NULL on a page that reads
   *  its history flat, which is every family but SparkLend and Aave V3 today;
   *  a renderer must fall back to `displayedEvents` there, and to its own
   *  client-side run detection. */
  displayedRows: DisplayedTimelineRow[] | null;
  /** How many ROWS the index served, before this page's own filters — the
   *  count the toolbar states beside the position's events once the two part
   *  company. NULL where the page reads its history flat. */
  servedRowCount: number | null;
  /** The earliest and latest moments the served answer covers, before any
   *  filter — a folder by its own span. A folder's members are not in
   *  `sortedEvents`, so an answer made only of folders holds no time without
   *  this. NULL where the page reads its history flat. */
  servedSpan: { firstAt: number; lastAt: number } | null;
  /** Members per UTC calendar day across the folders that SURVIVE the page's
   *  type/asset filters — the density the activity map would otherwise be
   *  missing, since a folder's members are not in `visibleEvents`. Keyed the
   *  same way the opening balance's `byDay` is, and NOT part of it: these days
   *  sit ABOVE the cut and their events are one tap away, so they are ordinary,
   *  selectable days (settled 2026-09-12). NULL where the page reads its
   *  history flat.
   *
   *  Deliberately NOT narrowed by the date range: it feeds the map that the
   *  range is selected ON, and a map that shrank to its own selection would
   *  leave the reader nothing to select next. */
  folderDays: OpeningBucket[] | null;
  /** How many EVENTS this page's list covers — folder members included, which
   *  is why it is not `sortedEvents.length` on a grouped page. Everything
   *  that states "what is drawn" against "what the position has" reads this:
   *  the toolbar's count line, and the boundary card's own small print. On a
   *  flat page it IS `sortedEvents.length`. */
  servedEventCount: number;
  /** 1-based chronological number for an event over the position's WHOLE
   *  history — so the oldest card of a window that opens on event 103,014 is
   *  numbered 103,014 and not 1. */
  eventNumberOf: (e: BaseActivityEvent) => number;

  /** The window this page is drawing, and whether its opening balance has
   *  arrived. Read `state` before stating any lifetime figure: in "pending" and
   *  "failed" the whole-history reductions are UNKNOWN, and reducing the loaded
   *  rows alone would present a window's arithmetic as a lifetime. */
  historyWindow: TimelineWindow;
  /** Events summarised below the cut — 0 when the rows are the whole history. */
  openingCount: number;
  /** Events before the oldest loaded row on an arm that trims the drawn list
   *  server-side (the Base replays, the vault loaders, a plain `limit`) —
   *  the numbering offset where there is no opening balance to seed one.
   *  0 when the rows are the whole history. */
  olderCount: number;
  /** True when `olderCount` (and so `totalCount`) is a floor, not a census. */
  olderCountIsFloor: boolean;
  /** The protocol key the page passed — the boundary card labels the
   *  opening balance's action keys with the same table the filter menu uses. */
  protocolKey: string;

  /** Action-type buckets for the FilterDropdown (demoted sorted to bottom). */
  eventOptions: FilterOption[];
  /** Keys currently shown (FilterDropdown `selected` for multi mode). */
  visibleActionKeys: Set<string>;
  toggleHiddenAction: (key: string) => void;
  resetHiddenActions: () => void;

  /** Asset buckets for the FilterDropdown — the symbols this position's events
   *  touched, commonest first. Empty or single-entry on a roster with no asset
   *  axis (see getEventAssetKeys), and the toolbar renders no control then. */
  assetOptions: FilterOption[];
  /** Symbols currently shown (FilterDropdown `selected` for multi mode). */
  visibleAssetKeys: Set<string>;
  toggleHiddenAsset: (key: string) => void;
  resetHiddenAssets: () => void;

  /** Counterparty-address buckets for the FilterDropdown — the addresses this
   *  wallet's events moved value with, commonest first. Empty or single-entry
   *  on a roster with no counterparty axis (see getEventCounterpartyKeys), and
   *  the toolbar renders no control then. */
  counterpartyOptions: FilterOption[];
  /** Addresses currently shown (FilterDropdown `selected` for multi mode). */
  visibleCounterpartyKeys: Set<string>;
  toggleHiddenCounterparty: (key: string) => void;
  resetHiddenCounterparties: () => void;

  dateRange: [number, number] | null;
  setDateRange: (next: [number, number] | null) => void;
  heatmapOpen: boolean;
  toggleHeatmap: () => void;

  /** The current page's URL with the whole view — sort, the three hidden
   *  sets, the date range — written into it (see the file header). Composed
   *  on demand, so it is complete even when nothing has been toggled this
   *  load and the address bar is still clean. Other params on the page
   *  (`recent`, `epoch`, `loan`) are kept as they are. */
  viewHref: () => string;

  totalCount: number;
  /** The events the filters admit. From this hook it counts the LOOSE events
   *  only: a folder's members are not on the page until they are read, so
   *  ChainTruthTimeline adds each standing folder's share before the toolbar
   *  states it (`filteredEventCount`, lib/shared/timeline-folder-filter.ts). */
  filteredCount: number;
  /** True while `filteredCount` is a floor — a folder the filter splits whose
   *  members have not been read yet. Always false from this hook. */
  filteredCountIsFloor: boolean;
  isFiltered: boolean;
  /** Does one event pass every filter on the page, the date range included?
   *  The predicate a folder's members answer once they are read. */
  memberPasses: (e: BaseActivityEvent) => boolean;

  /** One-off visibility correction for a `?at=<id>` landing (see
   *  `ChainTruthTimeline`'s pinned/landing handling): clears the event from
   *  whichever hidden sets are hiding it and drops an active date range, so
   *  the reader lands on it actually visible rather than on a filtered list
   *  that quietly omits the very thing the link pointed at. Deliberately a
   *  REAL state change (not a display-only bypass) — the filter menu's
   *  checkboxes stay truthful about what is now shown — but it skips the
   *  usual localStorage write-back (see the persist effect below): a landing
   *  is a one-off correction for this load, not the visitor's new saved
   *  preference. It never touches the URL either, for the same reason —
   *  `interactedRef` is untouched, so only an explicit toolbar toggle writes
   *  view state into the address bar. No-op when the event is already fully
   *  visible. */
  revealEvent: (event: BaseActivityEvent) => void;
}

interface PersistedState {
  hiddenActions: string[];
  /** Absent in entries written before the asset axis existed — read as none
   *  hidden, which is what those readers were seeing. */
  hiddenAssets?: string[];
  /** Absent in entries written before the counterparty axis existed — read as
   *  none hidden, same as hiddenAssets above. */
  hiddenCounterparties?: string[];
}

/** The view as the URL carries it — the hook's own state, minus display. */
interface ViewParams {
  hiddenActions: string[];
  hiddenAssets: string[];
  hiddenCounterparties: string[];
  dateRange: [number, number] | null;
}

const SECONDS_PER_DAY = 86_400;
const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** `2025-03-01` → its first second UTC; null for anything that is not a real
 *  calendar day (`2025-02-30` rolls over in Date.UTC, so the round trip is
 *  checked too). */
function parseUtcDay(s: string | null): number | null {
  if (!s || !UTC_DAY.test(s)) return null;
  const ts = Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  if (!Number.isFinite(ts) || formatUtcDay(ts / 1000) !== s) return null;
  return ts / 1000;
}

const formatUtcDay = (ts: number): string => new Date(ts * 1000).toISOString().slice(0, 10);

const splitList = (s: string | null): string[] | null => (s === null ? null : s.split(",").filter(Boolean));

/** Write the view into `sp`, one param per axis, deleting each param whose
 *  axis is at its default so an untouched view keeps a clean URL. The ONE
 *  place the grammar is written — the address-bar mirror and `viewHref()`
 *  both go through it, so a copied link and a written-back one never differ. */
function writeViewParams(sp: URLSearchParams, view: ViewParams): void {
  const list = (key: string, values: string[]) => {
    if (values.length > 0) sp.set(key, values.join(","));
    else sp.delete(key);
  };
  // `order` is retired — there is one order now. Deleted unconditionally so a
  // link inherited from the two-order era stops claiming a view this page
  // cannot be in, rather than carrying a dead param through every later edit.
  sp.delete("order");
  list("hide", view.hiddenActions);
  list("hideAssets", view.hiddenAssets);
  list("hideAddresses", view.hiddenCounterparties);
  if (view.dateRange) {
    sp.set("from", formatUtcDay(view.dateRange[0]));
    sp.set("to", formatUtcDay(view.dateRange[1]));
  } else {
    sp.delete("from");
    sp.delete("to");
  }
}

/** Read the view back out of `sp`. Each axis is `undefined` when its param is
 *  absent — the caller keeps whatever it restored from storage for that axis —
 *  and a malformed date pair (one side missing, not a day, from after to) is
 *  ignored the same way rather than half-applied. */
function readViewParams(sp: URLSearchParams): Partial<ViewParams> {
  const view: Partial<ViewParams> = {};
  const hide = splitList(sp.get("hide"));
  if (hide) view.hiddenActions = hide;
  const hideAssets = splitList(sp.get("hideAssets"));
  if (hideAssets) view.hiddenAssets = hideAssets;
  const hideAddresses = splitList(sp.get("hideAddresses"));
  if (hideAddresses) view.hiddenCounterparties = hideAddresses;
  const from = parseUtcDay(sp.get("from"));
  const to = parseUtcDay(sp.get("to"));
  if (from !== null && to !== null && from <= to) view.dateRange = [from, to + SECONDS_PER_DAY - 1];
  return view;
}

export function useTimelineEvents(
  events: BaseActivityEvent[],
  {
    storageKey,
    protocolKey,
    initialHidden,
    window: win = WHOLE_HISTORY,
    olderCount = 0,
    olderCountIsFloor = false,
    servedRows,
    eventsServed,
  }: {
    storageKey?: string;
    protocolKey: string;
    /** The index's own answer as ROWS, in ASCENDING chain order: folders and
     *  ungrouped events interleaved (decision 0019's evening amendment). Pass
     *  it together with `events` — which must be exactly the ungrouped events
     *  of these rows, since every reduction on the page still runs over those.
     *  Omitted (the fifteen families that still group client-side, and the two
     *  that group server-side but were asked for a flat answer) leaves every
     *  behaviour below exactly as it was. */
    servedRows?: ServedTimelineRow<BaseActivityEvent>[];
    /** How many EVENTS `servedRows` covers — folder members included. Not
     *  `events.length`, and not `servedRows.length`. It is what seeds the
     *  numbering: the first served row sits at `totalEvents − eventsServed +
     *  1`, never at 1 and never at a number derived from the answer's own
     *  length after grouping. */
    eventsServed?: number;
    /** Events before the oldest row in `events`, on an arm whose list was
     *  trimmed server-side and that carries no opening balance (the Base
     *  replays' `coverage.omitted.count`, a vault window's `of − rows`, a
     *  `limit` fetch's `totalEvents − events.length`). Numbering runs over the
     *  whole history from it — the newest row is numbered `olderCount +
     *  events.length` and the oldest loaded row `olderCount + 1` — and the
     *  toolbar's count line states the whole total beside the listed count.
     *  Ignored when `window` carries an opening balance, which already seeds
     *  the same offset with a breakdown behind it. */
    olderCount?: number;
    /** `olderCount` is a lower bound (a vault lane that refused the
     *  whole-range sweep): every total reads "at least". */
    olderCountIsFloor?: boolean;
    /** The window the page fetched, from `?recent=N`. Omitted means the events
     *  passed in ARE the whole history, which is the case for 837,290 of the
     *  838k positions in the index and for every protocol that has not been
     *  moved onto the checkpoint model yet. */
    window?: TimelineWindow;
    /** Overrides the persisted hidden-action set with a fixed list — a
     *  shareable / embeddable pre-filtered timeline (e.g. `?hide=op1,op2`
     *  on the Liquity V2 trove page, whose home-hero iframe sets aside
     *  redemptions + delegate rate updates). Display-level only: present,
     *  it never gets written back to `storageKey`, and the visitor's own
     *  saved filter stays untouched underneath it. */
    initialHidden?: string[] | null;
  },
): TimelineEventsState {
  const defaultHidden = useMemo(() => DEFAULT_HIDDEN_ACTIONS[protocolKey] ?? [], [protocolKey]);

  const [hiddenActions, setHiddenActions] = useState<string[]>(defaultHidden);
  const [hiddenAssets, setHiddenAssets] = useState<string[]>([]);
  const [hiddenCounterparties, setHiddenCounterparties] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[number, number] | null>(null);
  const [heatmapOpen, setHeatmapOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Flips true on the visitor's first live toggle of any view axis — the
  // gate for writing state into the URL. Keeps a silently-restored
  // localStorage preference from getting pasted into the address bar on
  // every load; see the file-header comment.
  const interactedRef = useRef(false);
  // Consumed by exactly the next persist-effect run after `revealEvent`
  // mutates hidden state — see that function and the persist effect below.
  const suppressNextPersistRef = useRef(false);

  // Load persisted per-position state (hidden types/assets/counterparties),
  // then let the URL's view params override it for this load.
  useEffect(() => {
    setHydrated(false);
    interactedRef.current = false;
    setHiddenActions(defaultHidden);
    setHiddenAssets([]);
    setHiddenCounterparties([]);
    setDateRange(null);
    if (!storageKey) {
      setHydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(`rails-ui-${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        setHiddenActions(Array.isArray(parsed.hiddenActions) ? parsed.hiddenActions : defaultHidden);
        setHiddenAssets(Array.isArray(parsed.hiddenAssets) ? parsed.hiddenAssets : []);
        setHiddenCounterparties(Array.isArray(parsed.hiddenCounterparties) ? parsed.hiddenCounterparties : []);
      }
    } catch {
      /* corrupt entry — fall back to defaults */
    } finally {
      try {
        const view = readViewParams(new URLSearchParams(window.location.search));
        if (view.hiddenActions) setHiddenActions(view.hiddenActions);
        if (view.hiddenAssets) setHiddenAssets(view.hiddenAssets);
        if (view.hiddenCounterparties) setHiddenCounterparties(view.hiddenCounterparties);
        if (view.dateRange) setDateRange(view.dateRange);
      } catch {
        /* malformed query string — keep the storage-derived state */
      }
      setHydrated(true);
    }
  }, [storageKey, defaultHidden]);

  // Persist after hydration.
  useEffect(() => {
    if (!storageKey || !hydrated) return;
    // `revealEvent` (a `?at=` landing's one-off visibility fix) flags this
    // ref right before the state change that fires this effect — skip
    // exactly that one write so the correction never becomes the visitor's
    // saved preference, then fall through to persisting normally again.
    if (suppressNextPersistRef.current) {
      suppressNextPersistRef.current = false;
      return;
    }
    try {
      localStorage.setItem(
        `rails-ui-${storageKey}`,
        JSON.stringify({ hiddenActions, hiddenAssets, hiddenCounterparties }),
      );
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  }, [storageKey, hydrated, hiddenActions, hiddenAssets, hiddenCounterparties]);

  // Mirror the view into the URL after the visitor's first live toggle (never
  // for a pinned `initialHidden` embed — see file header). Only ever a
  // non-default value is written, matching the listing driver's
  // sortBy/sortOrder convention, so an untouched timeline keeps a clean URL.
  useEffect(() => {
    if (!hydrated || !interactedRef.current || initialHidden) return;
    try {
      const url = new URL(window.location.href);
      writeViewParams(url.searchParams, {
        hiddenActions,
        hiddenAssets,
        hiddenCounterparties,
        dateRange,
      });
      const next = `${url.pathname}${url.search}${url.hash}`;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (next !== current) window.history.replaceState(window.history.state, "", next);
    } catch {
      /* non-fatal — the view still works, it just won't be shareable */
    }
  }, [hydrated, initialHidden, hiddenActions, hiddenAssets, hiddenCounterparties, dateRange]);

  // The same grammar, composed on demand for the copy-link control. Reads the
  // pinned set where an embed pins one, so the link carries what the page
  // actually shows.
  const viewHref = useCallback(() => {
    const url = new URL(window.location.href);
    writeViewParams(url.searchParams, {
      hiddenActions: initialHidden ?? hiddenActions,
      hiddenAssets,
      hiddenCounterparties,
      dateRange,
    });
    return url.toString();
  }, [initialHidden, hiddenActions, hiddenAssets, hiddenCounterparties, dateRange]);

  const hiddenSet = useMemo(() => new Set(initialHidden ?? hiddenActions), [initialHidden, hiddenActions]);
  const hiddenAssetSet = useMemo(() => new Set(hiddenAssets), [hiddenAssets]);
  const hiddenCounterpartySet = useMemo(() => new Set(hiddenCounterparties), [hiddenCounterparties]);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.timestamp - b.timestamp), [events]);

  // Events summarised below the cut. They are not in `events` and never will
  // be, so every number they contribute to is seeded from the opening balance
  // rather than counted.
  const openingCount = win.opening?.totalEvents ?? olderCount;

  // What the LIST covers, in events. On a served list that is `eventsServed`
  // — the folder members are drawn, one tap away, and every count that
  // compares the list against the position must say so; `sortedEvents` holds
  // only the ungrouped ones and would understate it by everything inside a
  // folder.
  const servedEventCount = eventsServed ?? sortedEvents.length;

  // Chronological numbering runs over the WHOLE history, so a window's first
  // card carries the number it would have had in the full list. Without the
  // offset a windowed page restarts at 1 and quietly renumbers the position.
  //
  // On a SERVED list the offset is not enough: the list has gaps where the
  // folders are, so index + offset would under-count every row below the
  // first one. The walk below runs over the ROWS instead — an event advances
  // the cursor by one, a folder by its own `count` — and SNAPS to each
  // folder's `ordinalFirst`, which is the wire's own statement and the only
  // authority here. A member fetched later takes `ordinalFirst + i` within its
  // folder (see `FolderMembersProvider`), which is the same walk one level
  // down.
  const numberByIndex = useMemo(() => {
    const map = new Map<string, number>();
    if (servedRows && eventsServed != null) {
      // The first served row's ordinal. The opening balance covers everything
      // below the cut and these rows cover everything from it, so the two meet
      // at `openingCount + 1` — the same seed the flat path uses, applied to
      // rows instead of to array positions. While the opening balance is still
      // in flight `openingCount` is 0 and the seed is short; the first folder's
      // own `ordinalFirst` snaps it, and the memo recomputes when the balance
      // lands, exactly as the flat path's numbering does.
      let cursor = openingCount + 1;
      for (const row of servedRows) {
        if (row.kind === "folder") {
          cursor = row.folder.ordinalLast + 1;
          continue;
        }
        map.set(row.event.id, cursor);
        cursor += 1;
      }
      return map;
    }
    sortedEvents.forEach((e, i) => map.set(e.id, openingCount + i + 1));
    return map;
  }, [sortedEvents, openingCount, servedRows, eventsServed]);
  const eventNumberOf = useCallback((e: BaseActivityEvent) => numberByIndex.get(e.id) ?? 0, [numberByIndex]);

  // Type, asset, and counterparty in one pass — all three are pre-date
  // filters, so all three shape what the heatmap buckets. An event with no
  // keys on a given axis (a roster with no asset/counterparty axis) can never
  // be hidden by it; an event with two survives while EITHER is still shown,
  // which is what keeps a liquidation on screen when the reader has narrowed
  // to the collateral it seized rather than the debt it covered.
  // The three pre-date axes as ONE predicate, because a folder's members are
  // judged by it too once they are read (`memberPasses` below) — a member and
  // a loose event must never answer the same filter differently.
  const passesAxes = useCallback(
    (e: BaseActivityEvent) => {
      if (hiddenSet.has(getEventActionKey(e))) return false;
      if (hiddenAssetSet.size > 0) {
        const assets = getEventAssetKeys(e);
        if (assets.length > 0 && !assets.some((a) => !hiddenAssetSet.has(a))) return false;
      }
      if (hiddenCounterpartySet.size > 0) {
        const counterparties = getEventCounterpartyKeys(e);
        if (counterparties.length > 0 && !counterparties.some((c) => !hiddenCounterpartySet.has(c))) return false;
      }
      return true;
    },
    [hiddenSet, hiddenAssetSet, hiddenCounterpartySet],
  );
  const visibleEvents = useMemo(() => sortedEvents.filter(passesAxes), [sortedEvents, passesAxes]);

  const memberPasses = useCallback(
    (e: BaseActivityEvent) =>
      passesAxes(e) && (!dateRange || (e.timestamp >= dateRange[0] && e.timestamp <= dateRange[1])),
    [passesAxes, dateRange],
  );

  const folderAxes = useMemo<FolderFilterAxes>(
    () => ({
      hiddenActions: hiddenSet,
      hiddenAssets: hiddenAssetSet,
      hiddenCounterparties: hiddenCounterpartySet,
      dateRange,
    }),
    [hiddenSet, hiddenAssetSet, hiddenCounterpartySet, dateRange],
  );

  const dateFilteredEvents = useMemo(() => {
    if (!dateRange) return visibleEvents;
    const [start, end] = dateRange;
    return visibleEvents.filter((e) => e.timestamp >= start && e.timestamp <= end);
  }, [visibleEvents, dateRange]);

  // `sortedEvents` and everything derived from it is ascending — the order the
  // replay runs in. The page reads the other way round, so the display list is
  // that one reversed, always.
  const displayedEvents = useMemo(() => [...dateFilteredEvents].reverse(), [dateFilteredEvents]);

  /**
   * The served list as ROWS, in display order.
   *
   * A folder stands or goes as one row, on its header (`folderAdmits`,
   * lib/shared/timeline-folder-filter.ts): it goes only when the header proves
   * no member can pass, and an axis the header cannot answer — the
   * counterparty, which the folder contract does not carry — admits. Each
   * standing folder carries `matched`, how many of its members the filters
   * admit where the header can say; a folder the filter SPLITS opens, and its
   * members answer the filter row by row (ChainTruthTimeline).
   */
  const displayedRows = useMemo<DisplayedTimelineRow[] | null>(() => {
    if (!servedRows) return null;
    const shown = new Set(dateFilteredEvents.map((e) => e.id));
    const kept: Array<{ kind: "event"; event: BaseActivityEvent } | { kind: "folder"; folder: ServedFolder }> = [];
    for (const row of servedRows) {
      if (row.kind === "event") {
        if (shown.has(row.event.id)) kept.push(row);
        continue;
      }
      if (folderAdmits(row.folder, folderAxes)) kept.push(row);
    }
    const ordered = kept.reverse();
    let flatIdx = 0;
    return ordered.map((row) =>
      row.kind === "event"
        ? ({ kind: "event", event: row.event, flatIdx: flatIdx++ } as const)
        : ({ kind: "folder", folder: row.folder, flatIdx, matched: folderMatchCount(row.folder, folderAxes) } as const),
    );
  }, [servedRows, dateFilteredEvents, folderAxes]);

  // The folders' own day histogram, over the folders the filters admit. The
  // activity map buckets `visibleEvents`, and a folder's members are not among
  // them — so without this a day whose events all sit inside folders draws
  // empty, which on the measured fixture is 81 of 150 days. It is the same
  // add-on-the-day-key the opening balance already gets, on days that are
  // ORDINARY (see the field doc).
  const folderDays = useMemo<OpeningBucket[] | null>(() => {
    if (!servedRows) return null;
    return foldersByDay(
      servedRows.flatMap((row) =>
        row.kind === "folder" && folderAdmits(row.folder, { ...folderAxes, dateRange: null }) ? [row.folder] : [],
      ),
    );
  }, [servedRows, folderAxes]);

  const servedSpan = useMemo<{ firstAt: number; lastAt: number } | null>(() => {
    if (!servedRows || servedRows.length === 0) return null;
    let firstAt = Infinity;
    let lastAt = -Infinity;
    for (const row of servedRows) {
      const lo = row.kind === "folder" ? row.folder.firstAt : row.event.timestamp;
      const hi = row.kind === "folder" ? row.folder.lastAt : row.event.timestamp;
      if (lo < firstAt) firstAt = lo;
      if (hi > lastAt) lastAt = hi;
    }
    return { firstAt, lastAt };
  }, [servedRows]);

  // Both menus count the POSITION, not the page: the opening balance seeds each
  // map and the loaded rows are added on top. A count here answers "how many of
  // these does this position have", which is a whole-history fact and was one
  // even before windowing — the list below has always been narrowed by the date
  // range and by the other axis. What the menu must never become is a count of
  // the window presented as a count of the position.
  const eventOptions = useMemo<FilterOption[]>(() => {
    const counts = seedCounts(win.opening?.byAction);
    for (const e of sortedEvents) {
      const key = getEventActionKey(e);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // A folder's members are not in `sortedEvents` — they are not on the page
    // at all until someone opens it — so the menu adds their own histogram
    // instead. `counts` is per event KIND in the index's own vocabulary, which
    // on the families that serve folders IS `getEventActionKey`'s key, so this
    // is key-for-key with the loop above. A folder's `other` bucket names no
    // kind and so joins none: it is a count without a key, and inventing one
    // would put real members into a bucket that is not theirs.
    for (const row of servedRows ?? []) {
      if (row.kind !== "folder") continue;
      for (const bucket of row.folder.counts) counts.set(bucket.key, (counts.get(bucket.key) ?? 0) + bucket.count);
    }
    const demoted = new Set(DEMOTED_ACTIONS[protocolKey] ?? []);
    return [...counts.entries()]
      .sort((a, b) => {
        const aD = demoted.has(a[0]) ? 1 : 0;
        const bD = demoted.has(b[0]) ? 1 : 0;
        if (aD !== bD) return aD - bD;
        return b[1] - a[1];
      })
      .map(([key, count]) => ({ key, label: actionLabel(key, protocolKey), count, demoted: demoted.has(key) }));
  }, [sortedEvents, protocolKey, win.opening, servedRows]);

  // Commonest asset first — no demoted tier here: an asset is a fact about the
  // position, never noise the way a bot's keep-alive touch is.
  const assetOptions = useMemo<FilterOption[]>(() => {
    // The opening balance's keys are display symbols by the time they reach
    // here — resolved in the summary proxy through the same resolver the rows
    // went through — so this merge is key-for-key. A symbol that resolved on one
    // side of the cut and degraded to a truncated address on the other would
    // split one asset into two options, and nothing downstream could tell that
    // from a real second asset.
    const counts = seedCounts(win.opening?.byAsset);
    for (const e of sortedEvents) {
      for (const key of getEventAssetKeys(e)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // The folders' own legs, for the same reason the action menu takes their
    // `counts`. One leg per (verb, asset), and its `count` is the members that
    // contributed to it — so a liquidation lands in both the debt asset's
    // bucket and the collateral's, which is exactly what `getEventAssetKeys`
    // does for a liquidation on the row path. A leg whose denomination the
    // proxy could not name has no symbol and joins no bucket: an unnamed asset
    // is an omission, never a bucket of its own.
    for (const row of servedRows ?? []) {
      if (row.kind !== "folder") continue;
      for (const leg of row.folder.legs) {
        if (leg.symbol) counts.set(leg.symbol, (counts.get(leg.symbol) ?? 0) + leg.count);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, label: key, count }));
  }, [sortedEvents, win.opening, servedRows]);

  // Commonest counterparty first. No opening-balance seed — the counterparty
  // axis has no lifetime summary to fold in (unlike action/asset counts),
  // which only matters on a windowed page: the option counts there cover the
  // loaded rows, not the position's whole history.
  const counterpartyOptions = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>();
    for (const e of sortedEvents) {
      for (const key of getEventCounterpartyKeys(e)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: shortAddr(key), count }));
  }, [sortedEvents]);

  const visibleAssetKeys = useMemo(
    () => new Set(assetOptions.map((o) => o.key).filter((k) => !hiddenAssetSet.has(k))),
    [assetOptions, hiddenAssetSet],
  );

  const visibleCounterpartyKeys = useMemo(
    () => new Set(counterpartyOptions.map((o) => o.key).filter((k) => !hiddenCounterpartySet.has(k))),
    [counterpartyOptions, hiddenCounterpartySet],
  );

  const visibleActionKeys = useMemo(
    () => new Set(eventOptions.map((o) => o.key).filter((k) => !hiddenSet.has(k))),
    [eventOptions, hiddenSet],
  );

  const toggleHiddenAction = useCallback((key: string) => {
    interactedRef.current = true;
    setHiddenActions((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return [...set];
    });
  }, []);

  const toggleHiddenAsset = useCallback((key: string) => {
    interactedRef.current = true;
    setHiddenAssets((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return [...set];
    });
  }, []);

  const toggleHiddenCounterparty = useCallback((key: string) => {
    interactedRef.current = true;
    setHiddenCounterparties((prev) => {
      const set = new Set(prev);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return [...set];
    });
  }, []);

  const resetHiddenActions = useCallback(() => {
    interactedRef.current = true;
    setHiddenActions([]);
  }, []);
  const resetHiddenAssets = useCallback(() => {
    interactedRef.current = true;
    setHiddenAssets([]);
  }, []);
  const resetHiddenCounterparties = useCallback(() => {
    interactedRef.current = true;
    setHiddenCounterparties([]);
  }, []);
  const toggleHeatmap = useCallback(() => setHeatmapOpen((v) => !v), []);
  // See the field doc on `TimelineEventsState.revealEvent`. Reads current
  // state directly (not via a setState updater) so the "does this actually
  // need a change" checks are exact — an updater callback's own body isn't
  // guaranteed to run before this function returns, so it can't be trusted to
  // decide whether to arm `suppressNextPersistRef` here.
  const revealEvent = useCallback(
    (event: BaseActivityEvent) => {
      const actionKey = getEventActionKey(event);
      const assetKeys = getEventAssetKeys(event);
      const counterpartyKeys = getEventCounterpartyKeys(event);
      const needsAction = hiddenActions.includes(actionKey);
      const needsAssets = assetKeys.some((k) => hiddenAssets.includes(k));
      const needsCounterparties = counterpartyKeys.some((k) => hiddenCounterparties.includes(k));
      const needsDateClear = dateRange !== null;
      if (!needsAction && !needsAssets && !needsCounterparties && !needsDateClear) return;
      suppressNextPersistRef.current = true;
      if (needsAction) setHiddenActions((prev) => prev.filter((k) => k !== actionKey));
      if (needsAssets) setHiddenAssets((prev) => prev.filter((k) => !assetKeys.includes(k)));
      if (needsCounterparties) setHiddenCounterparties((prev) => prev.filter((k) => !counterpartyKeys.includes(k)));
      if (needsDateClear) setDateRange(null);
    },
    [hiddenActions, hiddenAssets, hiddenCounterparties, dateRange],
  );
  // The one setter handed out raw: selecting a range in the heatmap is a live
  // toggle like any other, so it opens the address-bar mirror too.
  const setDateRangeLive = useCallback((next: [number, number] | null) => {
    interactedRef.current = true;
    setDateRange(next);
  }, []);

  const isFiltered =
    hiddenSet.size > 0 || hiddenAssetSet.size > 0 || hiddenCounterpartySet.size > 0 || dateRange !== null;

  return {
    sortedEvents,
    visibleEvents,
    displayedEvents,
    displayedRows,
    servedRowCount: servedRows ? servedRows.length : null,
    servedSpan,
    folderDays,
    servedEventCount,
    eventNumberOf,
    eventOptions,
    visibleActionKeys,
    toggleHiddenAction,
    resetHiddenActions,
    assetOptions,
    visibleAssetKeys,
    toggleHiddenAsset,
    resetHiddenAssets,
    counterpartyOptions,
    visibleCounterpartyKeys,
    toggleHiddenCounterparty,
    resetHiddenCounterparties,
    dateRange,
    setDateRange: setDateRangeLive,
    heatmapOpen,
    toggleHeatmap,
    viewHref,
    historyWindow: win,
    olderCount: win.opening ? 0 : olderCount,
    olderCountIsFloor: !win.opening && olderCountIsFloor,
    protocolKey,
    openingCount,
    // The position's own event count, not the page's — the two differ by the
    // opening balance whenever a window is in force.
    totalCount: openingCount + servedEventCount,
    // …and this one IS the page's: how many of the LOADED rows survive the
    // filters. The opening balance is not re-cut by a filter (see
    // lib/shared/timeline-opening-balance.ts), so it is stated beside this
    // figure rather than added to it.
    filteredCount: dateFilteredEvents.length,
    filteredCountIsFloor: false,
    isFiltered,
    memberPasses,
    revealEvent,
  };
}
