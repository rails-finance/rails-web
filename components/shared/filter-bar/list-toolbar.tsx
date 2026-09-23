"use client";

// ListToolbar — the shared listing-page filter strip: a free-text search input,
// the registry-driven facet dropdowns (<FilterSections>), and the <SortControl>,
// with the removable active-filter chips (<FilterChips>) beneath. One component
// arranges the whole grammar; a page passes its dimension registry + param
// object and the toolbar reads/writes it. Holds no state of its own — the param
// object (URL-backed) is the source of truth.

import { useRef, useState } from "react";
import { useHydrated } from "@/hooks/useHydrated";
import { Search } from "lucide-react";
import { FilterSections } from "@/components/shared/filter-bar/filter-sections";
import { FilterChips } from "@/components/shared/filter-bar/filter-chips";
import { SortControl, type SortOption } from "@/components/shared/filter-bar/sort-control";
import { WalletHistoryDropdown } from "@/components/shared/wallet-history-dropdown";
import type { FilterDimension } from "@/components/shared/filter-bar/types";
import { ctrlWaking } from "@/lib/shared/ui-grammar";
import type { BaseListFilters } from "@/lib/shared/list-filter";
import type { BookmarkScope } from "@/lib/shared/sessions";

export interface ListToolbarProps<F extends BaseListFilters> {
  dimensions: FilterDimension<F>[];
  filters: F;
  onChange: (next: F) => void;
  sortOptions: SortOption[];
  /** Placeholder for the search input (e.g. "Search wallet or vault #"). */
  searchPlaceholder?: string;
  /** When set, the search box gains a bookmarks dropdown (this protocol's
   *  bookmarked wallets); picking one runs `onPick` with the lowercase address.
   *  Omit to keep a plain search box. */
  bookmarks?: { protocol: BookmarkScope; onPick: (wallet: string) => void };
}

export function ListToolbar<F extends BaseListFilters>({
  dimensions,
  filters,
  onChange,
  sortOptions,
  searchPlaceholder = "Search wallet or id",
  bookmarks,
}: ListToolbarProps<F>) {
  const searchRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  // Inert until this strip's handlers are attached — including the search box,
  // which pre-hydration accepts typing into a value React then overwrites from
  // its own empty state. A swallowed query is the same bug as a swallowed click.
  const hydrated = useHydrated();
  // Bookmarks surface only when the box is focused and empty — while typing a
  // query the list stays out of the way.
  const showBookmarks = !!bookmarks && focused && !filters.q;

  return (
    <div className="mb-6 flex flex-col gap-3" data-skel-section="listing-toolbar" {...ctrlWaking(hydrated)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]" ref={searchRef}>
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rb-500"
            aria-hidden="true"
          />
          <input
            value={filters.q}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            onFocus={() => setFocused(true)}
            placeholder={searchPlaceholder}
            spellCheck={false}
            autoComplete="off"
            className="h-8 w-full rounded-md bg-raised pl-8 pr-3 text-xs text-foreground placeholder:text-rb-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {bookmarks && (
            <WalletHistoryDropdown
              show={showBookmarks}
              containerRef={searchRef}
              onClose={() => setFocused(false)}
              onPick={(address) => {
                setFocused(false);
                bookmarks.onPick(address);
              }}
              protocol={bookmarks.protocol}
            />
          )}
        </div>
        <FilterSections dimensions={dimensions} filters={filters} onChange={onChange} />
        <SortControl
          options={sortOptions}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder}
          onChange={(sortBy, sortOrder) => onChange({ ...filters, sortBy, sortOrder })}
        />
      </div>
      <FilterChips dimensions={dimensions} filters={filters} onChange={onChange} />
    </div>
  );
}
