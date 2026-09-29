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
import { fxPositionSlug, type FxPoolKey } from "@/lib/fx/asset-catalog";
import { useFxPricesAt } from "@/lib/fx/use-event-state";
import { useMemo } from "react";
import type { FxListingPrice } from "@/components/protocol/fx/fx-position-card";
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

/** One price per pool for the whole listing: the oracle's anchor leg read at
 *  the block the pool's totals were swept at, the leg and block the position
 *  page's card uses for its USD figure. Position #1 exists in both pools; the
 *  read's position half goes unused. */
function usePoolAnchors(poolStats?: FxPoolStatsSummary[]): Partial<Record<FxPoolKey, FxListingPrice>> {
  const block = (k: FxPoolKey) => poolStats?.find((p) => p.pool === k)?.settledBlock ?? null;
  const wsteth = useFxPricesAt("wsteth", "1", block("wsteth"));
  const wbtc = useFxPricesAt("wbtc", "1", block("wbtc"));
  return useMemo(() => {
    const out: Partial<Record<FxPoolKey, FxListingPrice>> = {};
    for (const [k, r] of [
      ["wsteth", wsteth],
      ["wbtc", wbtc],
    ] as const)
      if (r?.anchorPrice != null) out[k] = { anchor: Number(r.anchorPrice) / 1e18, block: r.block };
    return out;
  }, [wsteth, wbtc]);
}

export function FxListing({ initialItems, initialTotal, initialKey, initialSearch, poolStats }: FxListingProps) {
  const anchors = usePoolAnchors(poolStats);
  return (
    <ChainTruthListingPage<FxPositionSummary, FxListFilters>
      title="f(x) Protocol Positions"
      noun="positions"
      basePath="/ethereum/fx"
      bookmarksProtocol="fx"
      defaults={FX_LIST_DEFAULTS}
      sortOptions={FX_SORT_OPTIONS}
      headerExtra={
        poolStats && poolStats.length > 0 ? <FxPoolStatsBand pools={poolStats} anchors={anchors} /> : undefined
      }
      searchPlaceholder="Search owner address or position #"
      renderCard={(p) => <FxPositionCard v={viewFromSummary(p)} listingPx={anchors[p.pool]} />}
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
