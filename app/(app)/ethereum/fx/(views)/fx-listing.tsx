"use client";

// f(x) listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from
// page.tsx. The driver owns the toolbar, pagination, debounced search and the
// fetch lifecycle; this file is just the f(x)-specific config.

import type { FxPositionSummary } from "@/lib/sources/api/fx-positions";
import type { FxPoolStatsSummary } from "@/lib/sources/api/fx-stats";
import { fetchFxPositions } from "@/lib/api/fetch-fx-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { FxPositionCard, viewFromSummary } from "@/components/protocol/fx/fx-position-card";
import { FxPoolStatsBand } from "@/components/protocol/fx/fx-pool-stats-band";
import { fxPositionSlug } from "@/lib/fx/asset-catalog";
import {
  fxListDimensions,
  fxFiltersToFetchParams,
  FX_LIST_DEFAULTS,
  FX_SORT_OPTIONS,
  FX_ITEMS_PER_PAGE,
  type FxListFilters,
} from "@/lib/fx/list-filter-dimensions";

export interface FxListingProps {
  initialItems?: FxPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  /** SSR-fetched per-pool aggregates for the header band ([] hides it). */
  poolStats?: FxPoolStatsSummary[];
}

export function FxListing({ initialItems, initialTotal, initialKey, initialSearch, poolStats }: FxListingProps) {
  return (
    <ChainTruthListingPage<FxPositionSummary, FxListFilters>
      title="f(x) Protocol Positions"
      noun="positions"
      basePath="/ethereum/fx"
      bookmarksProtocol="fx"
      defaults={FX_LIST_DEFAULTS}
      sortOptions={FX_SORT_OPTIONS}
      headerExtra={poolStats && poolStats.length > 0 ? <FxPoolStatsBand pools={poolStats} /> : undefined}
      searchPlaceholder="Search owner address or position #"
      renderCard={(p) => <FxPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/fx/${fxPositionSlug(p.pool, p.positionId)}`}
      keyFor={(p) => fxPositionSlug(p.pool, p.positionId)}
      strategy={serverStrategy<FxPositionSummary, FxListFilters>({
        dimensions: fxListDimensions(),
        itemsPerPage: FX_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchFxPositions(fxFiltersToFetchParams(filters, page)).then((r) => ({
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
