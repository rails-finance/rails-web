"use client";

// Frankencoin listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Frankencoin-specific config.
//
// hrefFor is ONE segment — /frankencoin/[position] — because a position IS
// its own contract: the address is the identity and the page key. keyFor is
// the same address for the same reason.

import { useEffect, useState } from "react";
import { fetchFrankencoinCollateralRoster } from "@/lib/api/fetch-frankencoin-collateral-roster";
import type { FrankencoinPositionSummary } from "@/lib/sources/api/frankencoin-positions";
import { fetchFrankencoinPositions } from "@/lib/api/fetch-frankencoin-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { FrankencoinPositionCard, viewFromSummary } from "@/components/protocol/frankencoin/frankencoin-position-card";
import {
  frankencoinListDimensions,
  frankencoinFiltersToFetchParams,
  FRANKENCOIN_LIST_DEFAULTS,
  FRANKENCOIN_SORT_OPTIONS,
  FRANKENCOIN_ITEMS_PER_PAGE,
  FRANKENCOIN_ROSTER_LOADING,
  reconcileFrankencoinCollateral,
  type FrankencoinListFilters,
  type FrankencoinRosterState,
} from "@/lib/frankencoin/list-filter-dimensions";

export interface FrankencoinListingProps {
  initialItems?: FrankencoinPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

// One roster fetch per browser session, shared by every render that needs it.
// Module scope rather than component state: this file is a client component and
// page.tsx fetches its own copy per request, so this is never a cross-request
// cache. The promise never rejects; a failure settles as "unavailable", which
// the registry reads as "offer no collateral facet".
let rosterState: FrankencoinRosterState = FRANKENCOIN_ROSTER_LOADING;
let rosterPromise: Promise<FrankencoinRosterState> | null = null;

function ensureRoster(): Promise<FrankencoinRosterState> {
  rosterPromise ??= fetchFrankencoinCollateralRoster()
    .then((roster): FrankencoinRosterState => (rosterState = { status: "ready", roster }))
    .catch((): FrankencoinRosterState => (rosterState = { status: "unavailable", roster: null }));
  return rosterPromise;
}

function useFrankencoinRoster(): FrankencoinRosterState {
  const [state, setState] = useState<FrankencoinRosterState>(rosterState);
  useEffect(() => {
    let cancelled = false;
    ensureRoster().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function FrankencoinListing({ initialItems, initialTotal, initialKey, initialSearch }: FrankencoinListingProps) {
  return (
    <ChainTruthListingPage<FrankencoinPositionSummary, FrankencoinListFilters, FrankencoinRosterState>
      title="Frankencoin Positions"
      noun="positions"
      basePath="/ethereum/frankencoin"
      defaults={FRANKENCOIN_LIST_DEFAULTS}
      sortOptions={FRANKENCOIN_SORT_OPTIONS}
      searchPlaceholder="Search owner address"
      renderCard={(p) => <FrankencoinPositionCard v={viewFromSummary(p)} surface="listing" />}
      hrefFor={(p) => `/ethereum/frankencoin/${p.position}`}
      keyFor={(p) => p.position}
      strategy={serverStrategy<FrankencoinPositionSummary, FrankencoinListFilters, FrankencoinRosterState>({
        dimensions: (f, state) => frankencoinListDimensions(f, state),
        useExternalState: useFrankencoinRoster,
        reconcile: reconcileFrankencoinCollateral,
        itemsPerPage: FRANKENCOIN_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchFrankencoinPositions(frankencoinFiltersToFetchParams(filters, page)).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
        fetchCount: (filters) =>
          fetchFrankencoinPositions({ ...frankencoinFiltersToFetchParams(filters, 1), limit: 1 }).then(
            (r) => r.pagination.total,
          ),
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
