"use client";

// LlamaLend listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the LlamaLend-specific config.
//
// hrefFor is TWO segments — /llamalend/[controller]/[user] — because that is
// literally the protocol's grain: each controller is an isolated market
// liquidated independently. keyFor is the pair for the same reason.

import type { LlamalendPositionSummary } from "@/lib/sources/api/llamalend-positions";
import { fetchLlamalendPositions } from "@/lib/api/fetch-llamalend-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { LlamalendPositionCard, viewFromSummary } from "@/components/protocol/llamalend/llamalend-position-card";
import {
  llamalendListDimensions,
  llamalendFiltersToFetchParams,
  LLAMALEND_LIST_DEFAULTS,
  LLAMALEND_SORT_OPTIONS,
  LLAMALEND_ITEMS_PER_PAGE,
  type LlamalendListFilters,
} from "@/lib/llamalend/list-filter-dimensions";

export interface LlamalendListingProps {
  initialItems?: LlamalendPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function LlamalendListing({ initialItems, initialTotal, initialKey, initialSearch }: LlamalendListingProps) {
  return (
    <ChainTruthListingPage<LlamalendPositionSummary, LlamalendListFilters>
      title="LlamaLend Positions"
      noun="positions"
      basePath="/ethereum/llamalend"
      bookmarksProtocol="llamalend"
      defaults={LLAMALEND_LIST_DEFAULTS}
      sortOptions={LLAMALEND_SORT_OPTIONS}
      searchPlaceholder="Search user address"
      renderCard={(p) => <LlamalendPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/llamalend/${p.controller}/${p.user}`}
      keyFor={(p) => `${p.controller}-${p.user}`}
      strategy={serverStrategy<LlamalendPositionSummary, LlamalendListFilters>({
        dimensions: llamalendListDimensions(),
        itemsPerPage: LLAMALEND_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchLlamalendPositions(llamalendFiltersToFetchParams(filters, page)).then((r) => ({
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
