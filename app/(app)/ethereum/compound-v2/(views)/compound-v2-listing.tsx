"use client";

// Compound V2 listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Compound-V2-specific config.

import type { CompoundV2PositionSummary } from "@/lib/sources/api/compound-v2-positions";
import { fetchCompoundV2Positions } from "@/lib/api/fetch-compound-v2-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { CompoundV2PositionCard, viewFromSummary } from "@/components/protocol/compound-v2/compound-v2-position-card";
import {
  compoundV2ListDimensions,
  compoundV2FiltersToFetchParams,
  COMPOUND_V2_LIST_DEFAULTS,
  COMPOUND_V2_SORT_OPTIONS,
  COMPOUND_V2_ITEMS_PER_PAGE,
  type CompoundV2ListFilters,
} from "@/lib/compound-v2/list-filter-dimensions";

export interface CompoundV2ListingProps {
  initialItems?: CompoundV2PositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function CompoundV2Listing({ initialItems, initialTotal, initialKey, initialSearch }: CompoundV2ListingProps) {
  return (
    <ChainTruthListingPage<CompoundV2PositionSummary, CompoundV2ListFilters>
      title="Compound V2 Positions"
      noun="positions"
      basePath="/ethereum/compound-v2"
      bookmarksProtocol="compound-v2"
      defaults={COMPOUND_V2_LIST_DEFAULTS}
      sortOptions={COMPOUND_V2_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <CompoundV2PositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/compound-v2/${p.wallet}`}
      keyFor={(p) => p.wallet}
      strategy={serverStrategy<CompoundV2PositionSummary, CompoundV2ListFilters>({
        dimensions: compoundV2ListDimensions(),
        itemsPerPage: COMPOUND_V2_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchCompoundV2Positions(compoundV2FiltersToFetchParams(filters, page)).then((r) => ({
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
