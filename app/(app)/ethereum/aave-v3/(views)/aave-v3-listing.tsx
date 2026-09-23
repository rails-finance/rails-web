"use client";

// Aave V3 listing — client half. Holds the presentation config + the server-driven
// strategy and hands them to the shared ChainTruthListingPage driver with the SSR
// first-paint data from page.tsx.

import { fetchAaveV3Positions, type AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { AaveV3PositionCard, viewFromSummary } from "@/components/protocol/aave-v3/aave-v3-position-card";
import {
  aaveV3ListDimensions,
  aaveV3FiltersToFetchParams,
  AAVE_V3_LIST_DEFAULTS,
  AAVE_V3_SORT_OPTIONS,
  AAVE_V3_ITEMS_PER_PAGE,
  type AaveV3ListFilters,
} from "@/lib/aave-v3/list-filter-dimensions";

export interface AaveV3ListingProps {
  initialItems?: AaveV3PositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function AaveV3Listing({ initialItems, initialTotal, initialKey, initialSearch }: AaveV3ListingProps) {
  return (
    <ChainTruthListingPage<AaveV3PositionRow, AaveV3ListFilters>
      title="Aave V3 Positions"
      noun="positions"
      basePath="/ethereum/aave-v3"
      bookmarksProtocol="aave-v3"
      defaults={AAVE_V3_LIST_DEFAULTS}
      sortOptions={AAVE_V3_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <AaveV3PositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/aave-v3/${p.wallet}?market=${p.market}`}
      keyFor={(p) => `${p.wallet}|${p.market}`}
      strategy={serverStrategy<AaveV3PositionRow, AaveV3ListFilters>({
        dimensions: aaveV3ListDimensions(),
        itemsPerPage: AAVE_V3_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchAaveV3Positions(aaveV3FiltersToFetchParams(filters, page)).then((r) => ({
            data: r.rows,
            total: r.total,
          })),
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
