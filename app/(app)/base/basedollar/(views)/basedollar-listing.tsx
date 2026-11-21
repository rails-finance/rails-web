"use client";

import { useState } from "react";
import { formerHoldFor } from "@/lib/liquity-fork/former-holders";
import { useForkHolderView } from "@/components/protocol/liquity/fork-holder-search";

// Basedollar Trove listing — client half. One row per Trove (across 5 collateral branches),
// replayed straight from the Basedollar TroveUpdated events — chain-direct values only
// (branch collateral + BD debt, user-set interest rate, status). There is no
// collateral ratio, no USD (interpreted layers, off by default). Holds the
// presentation config + the in-memory strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx.

import type { BasedollarTroveSummary } from "@/lib/sources/api/basedollar-troves";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { BasedollarPositionCard, viewFromSummary } from "@/components/protocol/basedollar/basedollar-position-card";
import {
  basedollarListDimensions,
  BASEDOLLAR_LIST_DEFAULTS,
  BASEDOLLAR_SORT_OPTIONS,
  BASEDOLLAR_APPLY,
  type BasedollarListFilters,
} from "@/lib/basedollar/list-filter-dimensions";

export interface BasedollarListingProps {
  initialItems?: BasedollarTroveSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function BasedollarListing({ initialItems, initialTotal, initialKey, initialSearch }: BasedollarListingProps) {
  // The search, so a Trove the searched wallet passed on reads "moved to"
  // (lib/liquity-fork/former-holders.ts).
  const [q, setQ] = useState(() => new URLSearchParams(initialSearch ?? "").get("q") ?? "");
  // A wallet search: the holder strip above the Troves and the wallet's
  // Stability Pool deposits under them (rails-ops TO-DO-stability-pool-deposits §1b).
  const holder = useForkHolderView("basedollar", q);
  return (
    <ChainTruthListingPage<BasedollarTroveSummary, BasedollarListFilters>
      title="Basedollar Troves"
      noun="Troves"
      basePath="/base/basedollar"
      defaults={BASEDOLLAR_LIST_DEFAULTS}
      sortOptions={BASEDOLLAR_SORT_OPTIONS}
      searchPlaceholder="Search trove id or collateral"
      renderCard={(t) => (
        <BasedollarPositionCard v={{ ...viewFromSummary(t), formerHold: formerHoldFor(t, q) }} compact />
      )}
      onFilters={(filters) => setQ(filters.q ?? "")}
      hrefFor={(t) => `/base/basedollar/${t.collateralType}/${t.id}`}
      keyFor={(t) => `${t.collateralType}-${t.id}`}
      strategy={memoryStrategy<BasedollarTroveSummary, BasedollarListFilters>({
        fetchAll: () =>
          fetchBasedollarTroves({ sortBy: "debt", sortOrder: "desc", limit: 500, former: true }).then((r) => r.data),
        dimensions: basedollarListDimensions,
        apply: BASEDOLLAR_APPLY,
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
