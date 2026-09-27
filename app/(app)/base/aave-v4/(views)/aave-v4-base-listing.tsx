"use client";

// Aave V4 Base listing — client half. The shared listing driver with the
// Ethereum Aave V4 listing card, pointed at /api/aave-v4-base. One hub and one
// spoke, so no hub or spoke facet; the asset facets are the spoke's reserves.
// Each row's balances are the spoke's own read at the block after the
// account's last event (rails-ops decision 0018), valued at the lane's latest
// oracle prices.

import { AaveV4PositionListingCard } from "@/components/aave-v4/AaveV4PositionListingCard";
import { AaveV4ListError } from "@/components/aave-v4/components/AaveV4ListError";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { fetchAaveV4SpokePositions, type AaveV4SpokePositionRow } from "@/lib/api/fetch-aave-v4-spoke-positions";
import { slugifySpoke } from "@/lib/aave-v4/spoke-meta";
import {
  aaveV4BaseListDimensions,
  aaveV4BaseFiltersToFetchParams,
  AAVE_V4_BASE_LIST_DEFAULTS,
  AAVE_V4_BASE_SORT_OPTIONS,
} from "@/lib/aave-v4-base/list-filter-dimensions";
import { AAVE_V4_ITEMS_PER_PAGE, type AaveV4ListFilters } from "@/lib/aave-v4/list-filter-dimensions";

export interface AaveV4BaseListingProps {
  initialItems?: AaveV4SpokePositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function AaveV4BaseListing({ initialItems, initialTotal, initialKey, initialSearch }: AaveV4BaseListingProps) {
  return (
    <ChainTruthListingPage<AaveV4SpokePositionRow, AaveV4ListFilters>
      title="Aave V4 Positions"
      noun="positions"
      basePath="/base/aave-v4"
      bookmarksProtocol="aave-v4-base"
      defaults={AAVE_V4_BASE_LIST_DEFAULTS}
      sortOptions={AAVE_V4_BASE_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(row) => <AaveV4PositionListingCard row={row} />}
      hrefFor={(row) =>
        `/base/aave-v4/spoke/${slugifySpoke(row.spokeName) ?? encodeURIComponent(row.spokeName)}/${row.wallet}`
      }
      keyFor={(row) => `${row.wallet}:${row.spoke}`}
      strategy={serverStrategy<AaveV4SpokePositionRow, AaveV4ListFilters>({
        dimensions: aaveV4BaseListDimensions(),
        itemsPerPage: AAVE_V4_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchAaveV4SpokePositions(aaveV4BaseFiltersToFetchParams(filters, page)).then((r) => ({
            data: r.rows,
            total: r.total,
          })),
      })}
      renderError={(err) => (
        <AaveV4ListError message={err instanceof Error ? err.message : "Failed to load positions"} />
      )}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
