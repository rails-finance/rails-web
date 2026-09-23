"use client";

// Moonwell listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Moonwell-specific config.

import type { MoonwellPositionSummary } from "@/lib/sources/api/moonwell-positions";
import { fetchMoonwellPositions } from "@/lib/api/fetch-moonwell-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { MoonwellPositionCard, viewFromSummary } from "@/components/protocol/moonwell/moonwell-position-card";
import {
  moonwellListDimensions,
  moonwellFiltersToFetchParams,
  MOONWELL_LIST_DEFAULTS,
  MOONWELL_SORT_OPTIONS,
  MOONWELL_ITEMS_PER_PAGE,
  type MoonwellListFilters,
} from "@/lib/moonwell/list-filter-dimensions";

export interface MoonwellListingProps {
  initialItems?: MoonwellPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function MoonwellListing({ initialItems, initialTotal, initialKey, initialSearch }: MoonwellListingProps) {
  return (
    <ChainTruthListingPage<MoonwellPositionSummary, MoonwellListFilters>
      title="Moonwell Positions"
      noun="positions"
      basePath="/ethereum/moonwell"
      bookmarksProtocol="moonwell"
      defaults={MOONWELL_LIST_DEFAULTS}
      sortOptions={MOONWELL_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <MoonwellPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/moonwell/${p.wallet}`}
      keyFor={(p) => p.wallet}
      strategy={serverStrategy<MoonwellPositionSummary, MoonwellListFilters>({
        dimensions: moonwellListDimensions(),
        itemsPerPage: MOONWELL_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchMoonwellPositions(moonwellFiltersToFetchParams(filters, page)).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
