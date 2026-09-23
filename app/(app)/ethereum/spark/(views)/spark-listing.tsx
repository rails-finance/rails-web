"use client";

// SparkLend listing — client half. Holds the presentation config (card / href) + the server-driven strategy, and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from page.tsx.
// The driver owns the toolbar, pagination, debounced search and the fetch
// lifecycle; this file is just the Spark-specific config.

import type { SparkPositionSummary } from "@/lib/sources/api/spark-positions";
import { fetchSparkPositions } from "@/lib/api/fetch-spark-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { SparkPositionCard, viewFromSummary } from "@/components/protocol/spark/spark-position-card";
import {
  sparkListDimensions,
  sparkFiltersToFetchParams,
  SPARK_LIST_DEFAULTS,
  SPARK_SORT_OPTIONS,
  SPARK_ITEMS_PER_PAGE,
  type SparkListFilters,
} from "@/lib/spark/list-filter-dimensions";

export interface SparkListingProps {
  initialItems?: SparkPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function SparkListing({ initialItems, initialTotal, initialKey, initialSearch }: SparkListingProps) {
  return (
    <ChainTruthListingPage<SparkPositionSummary, SparkListFilters>
      title="SparkLend Positions"
      noun="positions"
      basePath="/ethereum/spark"
      bookmarksProtocol="spark"
      defaults={SPARK_LIST_DEFAULTS}
      sortOptions={SPARK_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <SparkPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/spark/${p.wallet}`}
      keyFor={(p) => p.wallet}
      strategy={serverStrategy<SparkPositionSummary, SparkListFilters>({
        dimensions: sparkListDimensions(),
        itemsPerPage: SPARK_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchSparkPositions(sparkFiltersToFetchParams(filters, page)).then((r) => ({
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
