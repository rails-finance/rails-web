"use client";

// Aave V3 Base listing — client half. The shared Aave V3 listing driver pointed
// at the Base route. The listing's account set comes from a history backfill on
// the Base box and each row's balances from a chain sweep; the coverage banner
// stating where both stand lives on the rail's /info page with the intro.

import { fetchAaveV3Positions, type AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { AaveV3PositionCard, viewFromSummary } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { AAVE_V3_BASE_CARD_DEPLOYMENT } from "@/lib/aave-v3-base/position-provenance";
import {
  aaveV3BaseListDimensions,
  aaveV3BaseFiltersToFetchParams,
  AAVE_V3_BASE_LIST_DEFAULTS,
  AAVE_V3_BASE_SORT_OPTIONS,
} from "@/lib/aave-v3-base/list-filter-dimensions";
import { AAVE_V3_ITEMS_PER_PAGE, type AaveV3ListFilters } from "@/lib/aave-v3/list-filter-dimensions";

export interface AaveV3BaseListingProps {
  initialItems?: AaveV3PositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function AaveV3BaseListing({ initialItems, initialTotal, initialKey, initialSearch }: AaveV3BaseListingProps) {
  return (
    <ChainTruthListingPage<AaveV3PositionRow, AaveV3ListFilters>
      title="Aave V3 Positions"
      noun="positions"
      basePath="/base/aave-v3"
      bookmarksProtocol="aave-v3-base"
      defaults={AAVE_V3_BASE_LIST_DEFAULTS}
      sortOptions={AAVE_V3_BASE_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      // No replay lane behind a listing row: a closed row's "highest recorded"
      // says so rather than dashing as if nothing was ever held.
      renderCard={(p) => (
        <AaveV3PositionCard v={viewFromSummary(p)} deployment={AAVE_V3_BASE_CARD_DEPLOYMENT} peaks={false} />
      )}
      hrefFor={(p) => `/base/aave-v3/${p.wallet}`}
      keyFor={(p) => p.wallet}
      strategy={serverStrategy<AaveV3PositionRow, AaveV3ListFilters>({
        dimensions: aaveV3BaseListDimensions(),
        itemsPerPage: AAVE_V3_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchAaveV3Positions(aaveV3BaseFiltersToFetchParams(filters, page)).then((r) => ({
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
