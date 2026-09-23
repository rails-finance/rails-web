"use client";

// Asymmetry Trove listing — client half. One row per Trove (across 5 collateral branches),
// replayed straight from the Asymmetry TroveUpdated events — chain-direct values only
// (branch collateral + USDaf debt, user-set interest rate, status). There is no
// collateral ratio, no USD (interpreted layers, off by default). Holds the
// presentation config + the in-memory strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx.

import type { AsymmetryTroveSummary } from "@/lib/sources/api/asymmetry-troves";
import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { AsymmetryPositionCard, viewFromSummary } from "@/components/protocol/asymmetry/asymmetry-position-card";
import {
  asymmetryListDimensions,
  ASYMMETRY_LIST_DEFAULTS,
  ASYMMETRY_SORT_OPTIONS,
  ASYMMETRY_APPLY,
  type AsymmetryListFilters,
} from "@/lib/asymmetry/list-filter-dimensions";

export interface AsymmetryListingProps {
  initialItems?: AsymmetryTroveSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function AsymmetryListing({ initialItems, initialTotal, initialKey, initialSearch }: AsymmetryListingProps) {
  return (
    <ChainTruthListingPage<AsymmetryTroveSummary, AsymmetryListFilters>
      title="Asymmetry Troves"
      noun="Troves"
      basePath="/ethereum/asymmetry"
      defaults={ASYMMETRY_LIST_DEFAULTS}
      sortOptions={ASYMMETRY_SORT_OPTIONS}
      searchPlaceholder="Search trove id or collateral"
      renderCard={(t) => <AsymmetryPositionCard v={viewFromSummary(t)} compact />}
      hrefFor={(t) => `/ethereum/asymmetry/${t.collateralType}/${t.id}`}
      keyFor={(t) => `${t.collateralType}-${t.id}`}
      strategy={memoryStrategy<AsymmetryTroveSummary, AsymmetryListFilters>({
        fetchAll: () => fetchAsymmetryTroves({ sortBy: "debt", sortOrder: "desc", limit: 500 }).then((r) => r.data),
        dimensions: asymmetryListDimensions,
        apply: ASYMMETRY_APPLY,
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
