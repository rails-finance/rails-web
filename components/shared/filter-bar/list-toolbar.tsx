"use client";

// ListToolbar — the shared listing-page filter strip (N1, ui-jobs 801): the
// Filters button (N1.8.1) that opens every filter, one pill per filter group
// that is set or rests on a default (N1.10, ui-jobs 681), Clear all, and at
// the right a count line where the page writes one (N1.6; the plain count
// is under the results, N3), the search as an icon that opens into its field
// and stays open while it holds a query (N1.1), the sort (N1.3) and the ⋮
// (N1.7). From sm one wrapping row: [Filters] [pills] [Clear all (two or more
// set)] and, right-aligned as one group that wraps together, [count] [search]
// [sort] [⋮]. Below sm: one row that scrolls sideways and never wraps, led by
// the Filters button; then Reset at the left and the count, the search, the
// sort and ⋮ at the right, the open search field taking the count's room.
// From sm the Filters button
// opens its panel under the row, and while it is open the row's other
// controls are dimmed and inert. A page passes its dimension registry and
// param object; the toolbar holds no filter state beyond which editor is
// open and the order the pills were set in.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { SearchBox } from "@/components/shared/front-door-search";
import { FilterSheet } from "@/components/shared/filter-bar/filter-sheet";
import { Search } from "lucide-react";
import { FilterPill, PANEL_OPEN_DIM, PILL_ICON_BUTTON, PILL_MUTED } from "@/components/shared/filter-bar/filter-pill";
import { GroupEditor } from "@/components/shared/filter-bar/pill-editor";
import { SortPill, type SortOption } from "@/components/shared/filter-bar/sort-control";
import {
  type PillModel,
  activeGroupCount,
  fixedOrder,
  groupDimensions,
  nextAppliedOrder,
  orderPills,
  pillFor,
  resetAll,
  resetGroup,
  savedViewFilterNames,
} from "@/components/shared/filter-bar/pill-model";
import { ListingViewMenu } from "@/components/shared/saved-items";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { ctrlWaking, INPLACE_TEXT } from "@/lib/shared/ui-grammar";
import type { BaseListFilters } from "@/lib/shared/list-filter";

export interface ListToolbarProps<F extends BaseListFilters> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
  sortOptions: SortOption[];
  /** Placeholder for the search input (e.g. "Search wallet or vault #"). */
  searchPlaceholder?: string;
  /** Result count, drawn under the pills (N1.6). */
  count?: { total: number; noun: string };
  /** In place of `count`, a count line the page writes (the vault roster's
   *  "N of M funded vaults", with its receipt). */
  countNode?: ReactNode;
  /** A locked chip drawn first in the pill row (AIM's Focus, N1.9). */
  chipsLead?: ReactNode;
  /** The search box's skeleton anchor (`data-skel-section`); "listing-toolbar"
   *  by default. */
  skel?: string;
  /** The ⋮ at the row's right end (N1.7): save listing, copy its link
   *  (ui-jobs 521). The chain-truth listings draw it. */
  viewMenu?: boolean;
  /** The editors' figure and noun ("Show 80 funded vaults") where the page
   *  draws its own `countNode` in place of `count`. */
  sheetCount?: { total: number; noun: string };
  /** A sort drawn below sm only, for a listing whose table sorts by its
   *  headers above sm and stacks as cards (D6) below it. */
  mobileSort?: {
    options: SortOption[];
    sortBy: string;
    sortOrder: "asc" | "desc";
    onChange: (sortBy: string, sortOrder: "asc" | "desc") => void;
  };
  /** True while the listing re-reads after a change; the sheet's count waits. */
  countPending?: boolean;
  /** The count a staged selection would give, from rows the listing holds.
   *  Given, the editors' button reads "Show {n}"; without it, "Apply". */
  countFor?: (draft: F) => number | Promise<number>;
  /** The noun for a draft, where the selection names it. */
  nounFor?: (draft: F) => string;
  /** Keys in the search field, for a listing whose search does more than
   *  filter (the Pendle roster's wallet row takes Enter). */
  onSearchKeyDown?: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
  /** False where the page names its subject and has nothing to search (the
   *  wallet page, ui-jobs 738): the row starts with the pills. */
  search?: boolean;
}

export function ListToolbar<F extends BaseListFilters>({
  dimensions,
  filters,
  onChange,
  sortOptions,
  searchPlaceholder = "Search wallet or id",
  count,
  countNode,
  chipsLead,
  skel = "listing-toolbar",
  viewMenu = false,
  sheetCount,
  mobileSort,
  countPending = false,
  countFor,
  nounFor,
  onSearchKeyDown,
  search = true,
}: ListToolbarProps<F>) {
  // Inert until this strip's handlers are attached — including the search box,
  // which pre-hydration accepts typing into a value React then overwrites from
  // its own empty state. A swallowed query is the same bug as a swallowed click.
  const hydrated = useHydrated();

  // `?find=1` (the guided way in's "Is a protocol's site down?", ui-jobs 478)
  // lands with the cursor in the search, once the field answers typing.
  const searchRef = useRef<HTMLInputElement>(null);
  // The search is an icon until it is pressed, and a field while it has the
  // cursor or a query (ui-jobs 801).
  const [searchOpened, setSearchOpened] = useState(false);
  const searchOpen = searchOpened || filters.q !== "";
  const focusSearch = useRef(false);
  const openSearch = () => {
    focusSearch.current = true;
    setSearchOpened(true);
  };
  useEffect(() => {
    if (!hydrated) return;
    if (new URLSearchParams(window.location.search).get("find") === "1") openSearch();
  }, [hydrated]);
  useEffect(() => {
    if (!searchOpen || !focusSearch.current) return;
    focusSearch.current = false;
    searchRef.current?.focus();
  }, [searchOpen]);

  // A dimension with `pill: false` (Status, ui-jobs 805) has no pill: it is
  // read and changed in the filter panel, and Clear all leaves it.
  const groups = groupDimensions(
    dimensions.filter((d) => d.pill !== false),
    filters,
  );
  const pills = groups.map((g) => pillFor(g, filters));
  // The order the set pills were set in: those set on arrival in the fixed
  // order, then each newly set one after them.
  const fixed = fixedOrder(pills.map((p) => p.name));
  const setNow = fixed.filter((n) => pills.find((p) => p.name === n)!.state !== "unset");
  const appliedRef = useRef<string[]>([]);
  appliedRef.current = nextAppliedOrder(appliedRef.current, setNow);
  // An unset group has no pill: the Filters button reaches it.
  const ordered = orderPills(pills, appliedRef.current).filter((p) => p.state !== "unset");
  const active = activeGroupCount(groups, filters);

  const [openPill, setOpenPill] = useState<string | null>(null);
  // Where the filters open from sm: under the row, above the results.
  const [sheetSlot, setSheetSlot] = useState<HTMLDivElement | null>(null);
  // While that panel is open it holds the focus: the row's other controls
  // are inert and dimmed, and an open pill editor closes (ui-jobs 801).
  const [panelOpen, setPanelOpen] = useState(false);
  const onPanelOpenChange = (o: boolean) => {
    setPanelOpen(o);
    if (o) setOpenPill(null);
  };
  const rowRef = useRef<HTMLDivElement>(null);
  useFlip(rowRef, ordered.map((p) => p.name).join("|"));

  const editorCount = count ?? sheetCount;
  // The row draws no plain count: the line under the results states it with
  // its noun (N3; Miles, 22 Nov 2026), and the figure stays here for screen
  // readers and its hook. A count line the page writes (chain data, with its
  // receipt) stays: below sm it takes a line to itself over the open search
  // field.
  const searchLine = search && searchOpen && countNode != null;
  const countLine =
    countNode != null ? (
      <span
        className={`min-w-0 text-sm tabular-nums sm:whitespace-nowrap ${PILL_MUTED} ${searchLine ? "max-sm:basis-full" : ""}`}
        data-anatomy="N1.6"
        data-prov-exempt=""
      >
        {countNode}
      </span>
    ) : count ? (
      <span className="sr-only" data-anatomy="N1.6" data-result-count={count.total} data-prov-exempt="">
        {count.total.toLocaleString("en-US")}
        <span className="sr-only"> {count.total === 1 ? count.noun.replace(/s$/, "") : count.noun}</span>
      </span>
    ) : null;

  return (
    <div
      className="group/toolbar mb-6 flex flex-col"
      data-skel-section={skel}
      data-anatomy="N1"
      data-filters-open={panelOpen ? "" : undefined}
      {...ctrlWaking(hydrated)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Below sm one sideways-scrolling row with a fade at its right edge;
            from sm its pills join the wrapping row (display: contents). */}
        <div className="relative max-sm:-mx-4 max-sm:min-w-0 max-sm:basis-[calc(100%+2rem)] sm:contents">
          <div
            ref={rowRef}
            className="flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:contents [&::-webkit-scrollbar]:hidden"
            data-pill-row=""
            data-anatomy="N1.2"
          >
            <FilterSheet
              dimensions={dimensions}
              filters={filters}
              onChange={onChange}
              count={editorCount}
              countPending={countPending}
              countFor={countFor}
              nounFor={nounFor}
              slot={sheetSlot}
              onPanelOpenChange={onPanelOpenChange}
            />
            {chipsLead != null && (
              <div className={`flex shrink-0 items-center ${PANEL_OPEN_DIM}`} inert={panelOpen}>
                {chipsLead}
              </div>
            )}
            {ordered.map((pill) => (
              <PillSlot
                key={pill.name}
                pill={pill}
                open={openPill === pill.name}
                setOpen={(o) => setOpenPill(o ? pill.name : null)}
                filters={filters}
                onChange={onChange}
                count={editorCount}
                countFor={countFor}
                nounFor={nounFor}
                inert={panelOpen}
              />
            ))}
            {/* Room past the last pill, so the fade never covers it. */}
            <span className="w-6 shrink-0 sm:hidden" aria-hidden="true" />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent sm:hidden"
            aria-hidden="true"
          />
        </div>
        {/* Clear all (two or more set) after the pills; below sm, Reset at the
            left of the count's line. */}
        {active > 0 && (
          <div
            className={`order-1 flex min-h-11 items-center sm:min-h-10 ${active < 2 ? "sm:hidden" : ""} ${PANEL_OPEN_DIM}`}
            inert={panelOpen}
          >
            <button
              type="button"
              onClick={() => onChange(resetAll(groups, filters))}
              className={`text-sm font-medium ${INPLACE_TEXT} rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
              data-pill-clear=""
              data-anatomy="N1.13"
            >
              <span className="sm:hidden">Reset</span>
              <span className="max-sm:hidden">Clear all</span>
            </button>
          </div>
        )}
        {/* The count, the sort and the ⋮: one group at the right that wraps
            together (Miles, 18 Nov 2026, ui-jobs 735). */}
        {/* Below sm the count gives way first: it wraps under its figure
            beside the sort, where a 343px row cannot hold all three on one
            line. */}
        <div
          className={`order-1 ml-auto flex min-h-11 min-w-0 items-center gap-3 sm:min-h-10 sm:shrink-0 ${search && searchOpen ? "max-sm:flex-1" : ""} ${searchLine ? "max-sm:basis-full max-sm:flex-wrap" : ""} ${PANEL_OPEN_DIM}`}
          inert={panelOpen}
        >
          {countLine}
          {/* The search, at the right before the sort (Miles, 21 Nov 2026):
              an icon until pressed, then the shared search's field (H15),
              which opens leftward; the listing's own behaviour: the query
              filters this explorer, family identifiers included. */}
          {search && !searchOpen && (
            <button
              type="button"
              onClick={openSearch}
              className={PILL_ICON_BUTTON}
              aria-label={searchPlaceholder}
              title={searchPlaceholder}
              data-search-open=""
              data-anatomy="N1.1"
            >
              <Search className="w-[18px] h-[18px]" aria-hidden="true" />
            </button>
          )}
          {search && searchOpen && (
            <SearchBox
              value={filters.q}
              onChange={(q) => onChange({ ...filters, q })}
              placeholder={searchPlaceholder}
              size="pill"
              anatomy="N1.1 H15"
              inputRef={searchRef}
              onKeyDown={onSearchKeyDown}
              onFocus={() => setSearchOpened(true)}
              onBlur={() => setSearchOpened(false)}
              className="min-w-0 max-sm:flex-[1_1_0%] sm:w-[300px]"
            />
          )}
          {sortOptions.length > 0 && (
            <SortPill
              options={sortOptions}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              onChange={(sortBy, sortOrder) => onChange({ ...filters, sortBy, sortOrder })}
            />
          )}
          {mobileSort && (
            <div className="flex shrink-0 items-center sm:hidden" data-toolbar-mobile-sort="">
              <SortPill
                options={mobileSort.options}
                sortBy={mobileSort.sortBy}
                sortOrder={mobileSort.sortOrder}
                onChange={mobileSort.onChange}
              />
            </div>
          )}
          {viewMenu && (
            <ListingViewMenu
              filterLabels={[...savedViewFilterNames(dimensions, filters), ...(filters.q ? [`“${filters.q}”`] : [])]}
            />
          )}
        </div>
      </div>
      <div ref={setSheetSlot} data-filter-sheet-slot="" />
    </div>
  );
}

/** One pill and its editor. */
function PillSlot<F>({
  pill,
  open,
  setOpen,
  filters,
  onChange,
  count,
  countFor,
  nounFor,
  inert,
}: {
  /** True while the Filters panel is open in the page. */
  inert: boolean;
  pill: PillModel<F>;
  open: boolean;
  setOpen: (open: boolean) => void;
  filters: F;
  onChange: (next: F) => void;
  count?: { total: number; noun: string };
  countFor?: (draft: F) => number | Promise<number>;
  nounFor?: (draft: F) => string;
}) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // After an edit the pill can change shape (set ↔ unset) once the URL has
  // moved: until then, each render puts focus back on its main button
  // wherever focus has fallen to the page.
  const focusUntil = useRef(0);
  const refocus = () => {
    focusUntil.current = Date.now() + 1500;
    requestAnimationFrame(() => buttonRef.current?.focus());
  };
  useEffect(() => {
    if (Date.now() > focusUntil.current) return;
    const at = document.activeElement;
    if (at === buttonRef.current) return;
    if (at == null || at === document.body || anchorRef.current?.contains(at)) buttonRef.current?.focus();
  });
  return (
    <div ref={anchorRef} className="contents" inert={inert}>
      <FilterPill
        name={pill.name}
        state={pill.state}
        locked={pill.locked}
        pinned={pill.pinned}
        label={pill.label}
        value={pill.value}
        spoken={pill.spoken}
        expanded={open}
        onOpen={() => setOpen(!open)}
        onRemove={() => {
          onChange(resetGroup(pill, filters));
          refocus();
        }}
        buttonRef={buttonRef}
      >
        {open && (
          <GroupEditor
            group={pill}
            locked={pill.locked}
            filters={filters}
            onChange={onChange}
            onClose={() => {
              setOpen(false);
              refocus();
            }}
            anchorRef={anchorRef}
            count={count}
            countFor={countFor}
            nounFor={nounFor}
          />
        )}
      </FilterPill>
    </div>
  );
}

/** When the pills' order changes, each slides from where it stood to where it
 *  stands now, so a newly set pill moves into the set group without the row
 *  jumping. Still under reduced motion. */
function useFlip(rowRef: React.RefObject<HTMLElement | null>, orderKey: string) {
  const prev = useRef<{ key: string; rects: Map<string, DOMRect> } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const els = [...row.querySelectorAll<HTMLElement>("[data-filter-pill]")];
    const rects = new Map(els.map((el) => [el.dataset.filterPill!, el.getBoundingClientRect()]));
    const before = prev.current;
    prev.current = { key: orderKey, rects };
    if (!before || before.key === orderKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const el of els) {
      const was = before.rects.get(el.dataset.filterPill!);
      const now = rects.get(el.dataset.filterPill!);
      if (!was || !now) continue;
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (!dx && !dy) continue;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 200ms ease-out";
        el.style.transform = "";
      });
    }
  }, [rowRef, orderKey]);
}
