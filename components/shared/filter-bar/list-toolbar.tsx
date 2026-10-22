"use client";

// ListToolbar — the shared listing-page filter strip: a free-text search input,
// the registry-driven facet dropdowns (<FilterSections>), and the <SortControl>,
// with the removable active-filter chips (<FilterChips>) beneath. One component
// arranges the whole grammar; a page passes its dimension registry + param
// object and the toolbar reads/writes it. Holds no state of its own — the param
// object (URL-backed) is the source of truth.

import { useHydrated } from "@/hooks/useHydrated";
import { SearchBox } from "@/components/shared/front-door-search";
import { FilterSections } from "@/components/shared/filter-bar/filter-sections";
import { FilterChips } from "@/components/shared/filter-bar/filter-chips";
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
}

export function ListToolbar<F extends BaseListFilters>({
  dimensions,
  filters,
  onChange,
  sortOptions,
  searchPlaceholder = "Search wallet or id",
  count,
}: ListToolbarProps<F>) {
  // Inert until this strip's handlers are attached — including the search box,
  // which pre-hydration accepts typing into a value React then overwrites from
  // its own empty state. A swallowed query is the same bug as a swallowed click.
  const hydrated = useHydrated();

  return (
    <div
      className="mb-6 flex flex-col gap-3"
      data-skel-section="listing-toolbar"
      data-anatomy="N1"
      {...ctrlWaking(hydrated)}
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* The shared search's look (H15); the listing's own behaviour: the
            query filters this explorer, family identifiers included. */}
        <SearchBox
          value={filters.q}
          onChange={(q) => onChange({ ...filters, q })}
          placeholder={searchPlaceholder}
          size="sm"
          anatomy="N1.1 H15"
          className="flex-1 min-w-[200px]"
        />
        <FilterSections dimensions={dimensions} filters={filters} onChange={onChange} />
        <SortControl
          options={sortOptions}
          sortBy={filters.sortBy}
          sortOrder={filters.sortOrder}
          onChange={(sortBy, sortOrder) => onChange({ ...filters, sortBy, sortOrder })}
        />
      </div>
      <FilterChips dimensions={dimensions} filters={filters} onChange={onChange} count={count} />
    </div>
  );
}
