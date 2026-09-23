"use client";

// Liquity V1 Trove listing — client half. One row per Trove, replayed straight from
// the Liquity V1 TroveUpdated events — chain-direct values only (ETH collateral +
// LUSD debt, status). Liquity V1 is interest-free, so the debt shown is exact; the
// detail page adds the live-read risk surfaces (ratio, runway, queue). Holds the
// presentation config + the server-driven strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx; the
// driver owns the toolbar, pagination, debounced search and the fetch lifecycle.

import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { LiquityV1PositionCard, viewFromSummary } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import {
  liquityV1ListDimensions,
  liquityV1FiltersToFetchParams,
  LIQUITY_V1_LIST_DEFAULTS,
  LIQUITY_V1_SORT_OPTIONS,
  LIQUITY_V1_ITEMS_PER_PAGE,
  type LiquityV1ListFilters,
} from "@/lib/liquity-v1/list-filter-dimensions";

export interface LiquityV1ListingProps {
  initialItems?: LiquityV1PositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function LiquityV1Listing({ initialItems, initialTotal, initialKey, initialSearch }: LiquityV1ListingProps) {
  return (
    <ChainTruthListingPage<LiquityV1PositionSummary, LiquityV1ListFilters>
      title="Liquity V1 Troves"
      noun="Troves"
      basePath="/ethereum/liquity-v1"
      bookmarksProtocol="liquity-v1"
      defaults={LIQUITY_V1_LIST_DEFAULTS}
      sortOptions={LIQUITY_V1_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <LiquityV1PositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/liquity-v1/${p.wallet}?epoch=${p.epoch}`}
      keyFor={(p) => `${p.wallet}-${p.epoch}`}
      strategy={serverStrategy<LiquityV1PositionSummary, LiquityV1ListFilters>({
        dimensions: liquityV1ListDimensions(),
        itemsPerPage: LIQUITY_V1_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchLiquityV1Positions(liquityV1FiltersToFetchParams(filters, page)).then((r) => ({
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
