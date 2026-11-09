"use client";

// ListToolbar — the shared listing-page filter strip: a free-text search input,
// the registry-driven facet dropdowns (<FilterSections>), and the <SortControl>,
// with the removable active-filter chips (<FilterChips>) beneath. One component
// arranges the whole grammar; a page passes its dimension registry + param
// object and the toolbar reads/writes it. Holds no state of its own — the param
// object (URL-backed) is the source of truth.

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { SearchBox } from "@/components/shared/front-door-search";
import { FilterSections } from "@/components/shared/filter-bar/filter-sections";
import { FilterSheet } from "@/components/shared/filter-bar/filter-sheet";
import { savedViewFilterNames, FilterChips } from "@/components/shared/filter-bar/filter-chips";
import { ListingViewMenu } from "@/components/shared/saved-items";
import { SortControl, type SortOption } from "@/components/shared/filter-bar/sort-control";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { ctrlWaking } from "@/lib/shared/ui-grammar";
import type { BaseListFilters } from "@/lib/shared/list-filter";

export interface ListToolbarProps<F extends BaseListFilters> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
  sortOptions: SortOption[];
  /** Placeholder for the search input (e.g. "Search wallet or vault #"). */
  searchPlaceholder?: string;
  /** Result count, drawn at the far right of the chip row. */
  count?: { total: number; noun: string };
  /** In place of `count`, a count line the page writes (the vault roster's
   *  "N of M funded vaults", with its receipt). */
  countNode?: ReactNode;
  /** The search box's skeleton anchor (`data-skel-section`); "listing-toolbar"
   *  by default. */
  skel?: string;
  /** The ⋮ at the row's right end (N1.7): save this view, copy its link
   *  (ui-jobs 521). The chain-truth listings draw it. */
  viewMenu?: boolean;
  /** The sheet's figure and noun ("Show 80 funded vaults") where the page
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
  /** The count a staged selection in the sheet would give. */
  countFor?: (draft: F) => number | Promise<number>;
  /** The sheet's noun for a draft, where the selection names it. */
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

  return (
    <div className="mb-6 flex flex-col gap-3" data-skel-section={skel} data-anatomy="N1" {...ctrlWaking(hydrated)}>
      <div className="flex flex-wrap items-center gap-2">
        {/* The shared search's look (H15); the listing's own behaviour: the
            query filters this explorer, family identifiers included. */}
        <SearchBox
          value={filters.q}
          onChange={(q) => onChange({ ...filters, q })}
          placeholder={searchPlaceholder}
          size="sm"
          anatomy="N1.1 H15"
          inputRef={searchRef}
          onKeyDown={onSearchKeyDown}
          className="flex-1 min-w-[200px] max-sm:basis-full"
        />
        {/* Below sm the facets are one Filters button opening the sheet
            (ui-jobs 544); from sm, the row of group buttons. */}
        <FilterSheet
          dimensions={dimensions}
          filters={filters}
          onChange={onChange}
          count={count ?? sheetCount}
          countPending={countPending}
          countFor={countFor}
          nounFor={nounFor}
        />
        <div className="contents max-sm:hidden">
          <FilterSections dimensions={dimensions} filters={filters} onChange={onChange} />
        </div>
        {sortOptions.length > 0 && (
          <SortControl
            options={sortOptions}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onChange={(sortBy, sortOrder) => onChange({ ...filters, sortBy, sortOrder })}
          />
        )}
        {mobileSort && (
          <div className="contents sm:hidden" data-toolbar-mobile-sort="">
            <SortControl
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
      <FilterChips dimensions={dimensions} filters={filters} onChange={onChange} count={count} countNode={countNode} />
    </div>
  );
}
