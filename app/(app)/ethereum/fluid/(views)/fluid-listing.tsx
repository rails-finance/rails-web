"use client";

// Fluid listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. Positions are NFTs — the wallet search filters by current owner,
// and each card links to /fluid/<nftId>.

import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import { fetchFluidPositions } from "@/lib/api/fetch-fluid-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { FluidPositionCard, viewFromSummary } from "@/components/protocol/fluid/fluid-position-card";
import {
  fluidListDimensions,
  fluidFiltersToFetchParams,
  FLUID_LIST_DEFAULTS,
  FLUID_SORT_OPTIONS,
  FLUID_ITEMS_PER_PAGE,
  type FluidListFilters,
} from "@/lib/fluid/list-filter-dimensions";

export interface FluidListingProps {
  initialItems?: FluidPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function FluidListing({ initialItems, initialTotal, initialKey, initialSearch }: FluidListingProps) {
  return (
    <ChainTruthListingPage<FluidPositionSummary, FluidListFilters>
      title="Fluid Positions"
      noun="positions"
      basePath="/ethereum/fluid"
      bookmarksProtocol="fluid"
      defaults={FLUID_LIST_DEFAULTS}
      sortOptions={FLUID_SORT_OPTIONS}
      searchPlaceholder="Search owner wallet or NFT id"
      renderCard={(p) => <FluidPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/fluid/${p.nftId}`}
      keyFor={(p) => p.nftId}
      strategy={serverStrategy<FluidPositionSummary, FluidListFilters>({
        dimensions: fluidListDimensions(),
        itemsPerPage: FLUID_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchFluidPositions(fluidFiltersToFetchParams(filters, page)).then((r) => ({
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
