"use client";

// Dolomite listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Dolomite-specific config.
//
// hrefFor is TWO segments — /dolomite/[owner]/[accountNumber] — because that
// is literally Account.Info: cross-margin within an account number, isolated
// across them. keyFor is the pair for the same reason.

import { useEffect, useState } from "react";
import { fetchDolomiteMarketRoster } from "@/lib/api/fetch-dolomite-market-roster";
import type { DolomitePositionSummary } from "@/lib/sources/api/dolomite-positions";
import { fetchDolomitePositions } from "@/lib/api/fetch-dolomite-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { DolomitePositionCard, viewFromSummary } from "@/components/protocol/dolomite/dolomite-position-card";
import {
  dolomiteListDimensions,
  dolomiteFiltersToFetchParams,
  DOLOMITE_LIST_DEFAULTS,
  DOLOMITE_SORT_OPTIONS,
  DOLOMITE_ITEMS_PER_PAGE,
  DOLOMITE_ROSTER_LOADING,
  reconcileDolomiteMarkets,
  type DolomiteListFilters,
  type DolomiteRosterState,
} from "@/lib/dolomite/list-filter-dimensions";

export interface DolomiteListingProps {
  initialItems?: DolomitePositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

// One roster fetch per browser session, shared by every render that needs it.
// Module scope rather than component state: this file is a client component and
// page.tsx fetches its own copy per request, so this is never a cross-request
// cache. The promise never rejects; a failure settles as "unavailable", which
// the registry reads as "offer no asset facets".
let rosterState: DolomiteRosterState = DOLOMITE_ROSTER_LOADING;
let rosterPromise: Promise<DolomiteRosterState> | null = null;

function ensureRoster(): Promise<DolomiteRosterState> {
  rosterPromise ??= fetchDolomiteMarketRoster()
    .then((roster): DolomiteRosterState => (rosterState = { status: "ready", roster }))
    .catch((): DolomiteRosterState => (rosterState = { status: "unavailable", roster: null }));
  return rosterPromise;
}

function useDolomiteRoster(): DolomiteRosterState {
  const [state, setState] = useState<DolomiteRosterState>(rosterState);
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

export function DolomiteListing({ initialItems, initialTotal, initialKey, initialSearch }: DolomiteListingProps) {
  return (
    <ChainTruthListingPage<DolomitePositionSummary, DolomiteListFilters, DolomiteRosterState>
      title="Dolomite Accounts"
      noun="accounts"
      basePath="/ethereum/dolomite"
      defaults={DOLOMITE_LIST_DEFAULTS}
      sortOptions={DOLOMITE_SORT_OPTIONS}
      searchPlaceholder="Search owner address"
      renderCard={(p) => <DolomitePositionCard v={viewFromSummary(p)} surface="listing" />}
      hrefFor={(p) => `/ethereum/dolomite/${p.owner}/${p.accountNumber}`}
      keyFor={(p) => `${p.owner}-${p.accountNumber}`}
      strategy={serverStrategy<DolomitePositionSummary, DolomiteListFilters, DolomiteRosterState>({
        dimensions: (f, state) => dolomiteListDimensions(f, state),
        useExternalState: useDolomiteRoster,
        reconcile: reconcileDolomiteMarkets,
        itemsPerPage: DOLOMITE_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchDolomitePositions(dolomiteFiltersToFetchParams(filters, page)).then((r) => ({
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
