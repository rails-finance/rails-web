"use client";

// Dolomite listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Dolomite-specific config.
//
// hrefFor is TWO segments — /dolomite/[owner]/[accountNumber] — because that
// is literally Account.Info: cross-margin within an account number, isolated
// across them. keyFor is the pair for the same reason.

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
  type DolomiteListFilters,
} from "@/lib/dolomite/list-filter-dimensions";

export interface DolomiteListingProps {
  initialItems?: DolomitePositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function DolomiteListing({ initialItems, initialTotal, initialKey, initialSearch }: DolomiteListingProps) {
  return (
    <ChainTruthListingPage<DolomitePositionSummary, DolomiteListFilters>
      title="Dolomite Accounts"
      noun="accounts"
      basePath="/ethereum/dolomite"
      bookmarksProtocol="dolomite"
      defaults={DOLOMITE_LIST_DEFAULTS}
      sortOptions={DOLOMITE_SORT_OPTIONS}
      searchPlaceholder="Search owner address"
      renderCard={(p) => <DolomitePositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/dolomite/${p.owner}/${p.accountNumber}`}
      keyFor={(p) => `${p.owner}-${p.accountNumber}`}
      strategy={serverStrategy<DolomitePositionSummary, DolomiteListFilters>({
        dimensions: dolomiteListDimensions(),
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
