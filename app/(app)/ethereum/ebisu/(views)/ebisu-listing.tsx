"use client";

// Ebisu Trove listing — client half. One row per Trove (across 5 collateral branches),
// replayed straight from the Ebisu TroveUpdated events — chain-direct values only
// (branch collateral + ebUSD debt, user-set interest rate, status). There is no
// collateral ratio, no USD (interpreted layers, off by default). Holds the
// presentation config + the in-memory strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx.

import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { EbisuPositionCard, viewFromSummary } from "@/components/protocol/ebisu/ebisu-position-card";
import {
  ebisuListDimensions,
  EBISU_LIST_DEFAULTS,
  EBISU_SORT_OPTIONS,
  EBISU_APPLY,
  type EbisuListFilters,
} from "@/lib/ebisu/list-filter-dimensions";

export interface EbisuListingProps {
  initialItems?: EbisuTroveSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function EbisuListing({ initialItems, initialTotal, initialKey, initialSearch }: EbisuListingProps) {
  return (
    <ChainTruthListingPage<EbisuTroveSummary, EbisuListFilters>
      title="Ebisu Troves"
      noun="Troves"
      basePath="/ethereum/ebisu"
      defaults={EBISU_LIST_DEFAULTS}
      sortOptions={EBISU_SORT_OPTIONS}
      searchPlaceholder="Search trove id or collateral"
      renderCard={(t) => <EbisuPositionCard v={viewFromSummary(t)} compact />}
      hrefFor={(t) => `/ethereum/ebisu/${t.collateralType}/${t.id}`}
      keyFor={(t) => `${t.collateralType}-${t.id}`}
      strategy={memoryStrategy<EbisuTroveSummary, EbisuListFilters>({
        fetchAll: () => fetchEbisuTroves({ sortBy: "debt", sortOrder: "desc", limit: 500 }).then((r) => r.data),
        dimensions: ebisuListDimensions,
        apply: EBISU_APPLY,
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
