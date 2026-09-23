"use client";

// Maple listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the Maple-specific config.

import type { MaplePositionSummary } from "@/lib/sources/api/maple-positions";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { fetchMaplePositions } from "@/lib/api/fetch-maple-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { MaplePositionCard, viewFromSummary } from "@/components/protocol/maple/maple-position-card";
import { MaplePoolStatsBand } from "@/components/protocol/maple/maple-pool-stats-band";
import {
  mapleListDimensions,
  mapleFiltersToFetchParams,
  MAPLE_LIST_DEFAULTS,
  MAPLE_SORT_OPTIONS,
  MAPLE_ITEMS_PER_PAGE,
  type MapleListFilters,
} from "@/lib/maple/list-filter-dimensions";

export interface MapleListingProps {
  initialItems?: MaplePositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  /** SSR-resolved per-pool chain state for the access band ({} hides it). */
  poolState?: Record<string, MaplePoolState>;
}

export function MapleListing({ initialItems, initialTotal, initialKey, initialSearch, poolState }: MapleListingProps) {
  return (
    <ChainTruthListingPage<MaplePositionSummary, MapleListFilters>
      title="Maple Positions"
      noun="positions"
      basePath="/ethereum/maple"
      bookmarksProtocol="maple"
      defaults={MAPLE_LIST_DEFAULTS}
      sortOptions={MAPLE_SORT_OPTIONS}
      headerExtra={
        poolState && Object.keys(poolState).length > 0 ? <MaplePoolStatsBand poolState={poolState} /> : undefined
      }
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <MaplePositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/maple/${p.wallet}`}
      keyFor={(p) => p.wallet}
      strategy={serverStrategy<MaplePositionSummary, MapleListFilters>({
        dimensions: mapleListDimensions(),
        itemsPerPage: MAPLE_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchMaplePositions(mapleFiltersToFetchParams(filters, page)).then((r) => ({
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
