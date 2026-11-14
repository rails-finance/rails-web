"use client";

// ListToolbar — the shared listing-page filter strip (N1): the search, one
// editable pill per filter group (N1.10, ui-jobs 681), the sort pill (N1.3),
// the ⋮ (N1.7), and under them the count (N1.6) with Clear all. From sm one
// wrapping row: [search] [set pills] [unset pills] [spacer] [sort] [⋮], and a
// thin row under it, Clear all at the left (two or more filters set) and the
// count at the right. Below sm: the search alone; one pill row that scrolls
// sideways and never wraps, led by the Filters button (N1.8.1); then the count
// and Reset at the left and the sort at the right. A page passes its dimension
// registry and param object; the toolbar holds no filter state beyond which
// editor is open and the order the pills were set in.

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
import { FilterPill, PILL_MUTED } from "@/components/shared/filter-bar/filter-pill";
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
}: ListToolbarProps<F>) {
  // Inert until this strip's handlers are attached — including the search box,
  // which pre-hydration accepts typing into a value React then overwrites from
  // its own empty state. A swallowed query is the same bug as a swallowed click.
  const hydrated = useHydrated();

  // `?find=1` (the guided way in's "Is a protocol's site down?", ui-jobs 478)
  // lands with the cursor in the search, once the field answers typing.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (new URLSearchParams(window.location.search).get("find") === "1") searchRef.current?.focus();
  }, [hydrated]);

  const groups = groupDimensions(dimensions, filters);
  const pills = groups.map((g) => pillFor(g, filters));
  // The order the set pills were set in: those set on arrival in the fixed
  // order, then each newly set one after them.
  const fixed = fixedOrder(pills.map((p) => p.name));
  const setNow = fixed.filter((n) => pills.find((p) => p.name === n)!.state !== "unset");
  const appliedRef = useRef<string[]>([]);
  appliedRef.current = nextAppliedOrder(appliedRef.current, setNow);
  const ordered = orderPills(pills, appliedRef.current);
  const active = activeGroupCount(groups, filters);

  const [openPill, setOpenPill] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  useFlip(rowRef, ordered.map((p) => p.name).join("|"));

  const editorCount = count ?? sheetCount;
  const countLine =
    countNode != null ? (
      <span className={`text-sm tabular-nums ${PILL_MUTED}`} data-anatomy="N1.6" data-prov-exempt="">
        {countNode}
      </span>
    ) : count ? (
      <span
        className={`text-sm tabular-nums ${PILL_MUTED}`}
        data-anatomy="N1.6"
        data-result-count={count.total}
        data-prov-exempt=""
      >
        {count.total.toLocaleString("en-US")}{" "}
        <CountNoun noun={count.total === 1 ? count.noun.replace(/s$/, "") : count.noun} />
      </span>
    ) : null;

  return (
    <div className="mb-6 flex flex-col" data-skel-section={skel} data-anatomy="N1" {...ctrlWaking(hydrated)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* The shared search's look (H15); the listing's own behaviour: the
            query filters this explorer, family identifiers included. */}
        <SearchBox
          value={filters.q}
          onChange={(q) => onChange({ ...filters, q })}
          placeholder={searchPlaceholder}
          size="md"
          anatomy="N1.1 H15"
          inputRef={searchRef}
          onKeyDown={onSearchKeyDown}
          className="max-sm:basis-full sm:min-w-[220px] sm:flex-[0_1_300px]"
        />
        {/* Below sm one sideways-scrolling row with a fade at its right edge;
            from sm its pills join the wrapping row (display: contents). */}
        <div className="relative max-sm:-mx-4 max-sm:mt-1 max-sm:min-w-0 max-sm:basis-[calc(100%+2rem)] sm:contents">
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
            />
            {chipsLead != null && <div className="flex shrink-0 items-center">{chipsLead}</div>}
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
        {/* The count and Clear all: below sm at the left of the sort's row;
            from sm a row of their own under the pills. */}
        <div className="order-1 flex min-h-11 flex-1 items-center gap-3 sm:order-2 sm:min-h-8 sm:basis-full">
          {countLine && <span className="sm:order-2 sm:ml-auto">{countLine}</span>}
          {active > 0 && (
            <button
              type="button"
              onClick={() => onChange(resetAll(groups, filters))}
              className={`text-sm font-medium ${INPLACE_TEXT} rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:order-1 ${active < 2 ? "sm:hidden" : ""}`}
              data-pill-clear=""
              data-anatomy="N1.13"
            >
              <span className="sm:hidden">Reset</span>
              <span className="max-sm:hidden">Clear all</span>
            </button>
          )}
        </div>
        {/* The sort and the ⋮ wrap together, at the right end of their line. */}
        <div className="order-1 flex shrink-0 items-center gap-1 sm:ml-auto">
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
    </div>
  );
}

/** The count's noun; below sm its last word alone ("open positions" reads
 *  "positions"), so the count fits beside the sort. */
function CountNoun({ noun }: { noun: string }) {
  const cut = noun.lastIndexOf(" ");
  if (cut < 0) return <>{noun}</>;
  return (
    <>
      <span className="max-sm:hidden">{noun.slice(0, cut + 1)}</span>
      {noun.slice(cut + 1)}
    </>
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
}: {
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
    <div ref={anchorRef} className="contents">
      <FilterPill
        name={pill.name}
        state={pill.state}
        locked={pill.locked}
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
