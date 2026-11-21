"use client";

import { useState } from "react";
import { formerHoldFor } from "@/lib/liquity-fork/former-holders";
import { useForkHolderView } from "@/components/protocol/liquity/fork-holder-search";

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
  // The search, so a Trove the searched wallet passed on reads "moved to"
  // (lib/liquity-fork/former-holders.ts).
  const [q, setQ] = useState(() => new URLSearchParams(initialSearch ?? "").get("q") ?? "");
  // A wallet search: the holder strip above the Troves and the wallet's
  // Stability Pool deposits under them (rails-ops TO-DO-stability-pool-deposits §1b).
  const holder = useForkHolderView("ebisu", q);
  return (
    <ChainTruthListingPage<EbisuTroveSummary, EbisuListFilters>
      title="Ebisu Troves"
      noun="Troves"
      basePath="/ethereum/ebisu"
      defaults={EBISU_LIST_DEFAULTS}
      sortOptions={EBISU_SORT_OPTIONS}
      searchPlaceholder="Search trove id or collateral"
      renderCard={(t) => <EbisuPositionCard v={{ ...viewFromSummary(t), formerHold: formerHoldFor(t, q) }} compact />}
      onFilters={(filters) => setQ(filters.q ?? "")}
      hrefFor={(t) => `/ethereum/ebisu/${t.collateralType}/${t.id}`}
      keyFor={(t) => `${t.collateralType}-${t.id}`}
      strategy={memoryStrategy<EbisuTroveSummary, EbisuListFilters>({
        fetchAll: () =>
          fetchEbisuTroves({ sortBy: "debt", sortOrder: "desc", limit: 500, former: true }).then((r) => r.data),
        dimensions: ebisuListDimensions,
        apply: EBISU_APPLY,
      })}
      renderAbove={holder.renderAbove}
      renderBelow={holder.renderBelow}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
