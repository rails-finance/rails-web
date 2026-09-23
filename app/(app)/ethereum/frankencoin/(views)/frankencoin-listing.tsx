"use client";

// Frankencoin listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Frankencoin-specific config.
//
// hrefFor is ONE segment — /frankencoin/[position] — because a position IS
// its own contract: the address is the identity and the page key. keyFor is
// the same address for the same reason.

import type { FrankencoinPositionSummary } from "@/lib/sources/api/frankencoin-positions";
import { fetchFrankencoinPositions } from "@/lib/api/fetch-frankencoin-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { FrankencoinPositionCard, viewFromSummary } from "@/components/protocol/frankencoin/frankencoin-position-card";
import {
  frankencoinListDimensions,
  frankencoinFiltersToFetchParams,
  FRANKENCOIN_LIST_DEFAULTS,
  FRANKENCOIN_SORT_OPTIONS,
  FRANKENCOIN_ITEMS_PER_PAGE,
  type FrankencoinListFilters,
} from "@/lib/frankencoin/list-filter-dimensions";

export interface FrankencoinListingProps {
  initialItems?: FrankencoinPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function FrankencoinListing({ initialItems, initialTotal, initialKey, initialSearch }: FrankencoinListingProps) {
  return (
    <ChainTruthListingPage<FrankencoinPositionSummary, FrankencoinListFilters>
      title="Frankencoin Positions"
      noun="positions"
      basePath="/ethereum/frankencoin"
      bookmarksProtocol="frankencoin"
      defaults={FRANKENCOIN_LIST_DEFAULTS}
      sortOptions={FRANKENCOIN_SORT_OPTIONS}
      searchPlaceholder="Search owner address"
      renderCard={(p) => <FrankencoinPositionCard v={viewFromSummary(p)} surface="listing" />}
      hrefFor={(p) => `/ethereum/frankencoin/${p.position}`}
      keyFor={(p) => p.position}
      strategy={serverStrategy<FrankencoinPositionSummary, FrankencoinListFilters>({
        dimensions: frankencoinListDimensions(),
        itemsPerPage: FRANKENCOIN_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchFrankencoinPositions(frankencoinFiltersToFetchParams(filters, page)).then((r) => ({
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
