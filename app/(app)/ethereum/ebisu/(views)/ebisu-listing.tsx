"use client";

// Ebisu Trove listing — client half. One row per Trove (across 5 collateral branches),
// replayed straight from the Ebisu TroveUpdated events — chain-direct values only
// (branch collateral + ebUSD debt, user-set interest rate, status). There is no
// collateral ratio, no USD (interpreted layers, off by default). Holds the
// presentation config + the in-memory strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx.
// The count names the Status choice ("open Troves"); the in-memory tier draws
// the listing's noun, so the noun follows the filters (ui-jobs 805).

import { useState } from "react";
import type { EbisuTroveSummary } from "@/lib/sources/api/ebisu-troves";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { decodeListFilters } from "@/lib/shared/list-filter";
import { troveCountLine } from "@/lib/liquity-v2/listing-visibility";
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
  const [noun, setNoun] = useState(
    () =>
      troveCountLine(
        decodeListFilters(ebisuListDimensions([]), new URLSearchParams(initialSearch ?? ""), EBISU_LIST_DEFAULTS),
      ).noun,
  );
  return (
    <ChainTruthListingPage<EbisuTroveSummary, EbisuListFilters>
      title="Ebisu Troves"
      noun={noun}
      onFilters={(f) => setNoun(troveCountLine(f).noun)}
      basePath="/ethereum/ebisu"
      defaults={EBISU_LIST_DEFAULTS}
      sortOptions={EBISU_SORT_OPTIONS}
      searchPlaceholder="Search trove id or collateral"
      renderCard={(t) => <EbisuPositionCard v={viewFromSummary(t)} compact />}
      walletSearch="ebisu"
      hrefFor={(t) => `/ethereum/ebisu/${t.collateralType}/${t.id}`}
      keyFor={(t) => `${t.collateralType}-${t.id}`}
      strategy={memoryStrategy<EbisuTroveSummary, EbisuListFilters>({
        fetchAll: () =>
          fetchEbisuTroves({ sortBy: "debt", sortOrder: "desc", limit: 500, former: true }).then((r) => r.data),
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
