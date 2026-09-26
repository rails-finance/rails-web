"use client";

// The Alchemix V2 position listing, the third type tab of the Ethereum
// explorer. Same driver and deployment record as the two V3 listings beside
// it. Every row is closed, on 2026-04-02, and no row carries a V3 figure.

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { AlchemixTypeTabs } from "@/components/protocol/alchemix/alchemix-type-tabs";
import { AlchemixV2PositionCard } from "@/components/protocol/alchemix/v2-position-card";
import { fetchAlchemixV2Positions } from "@/lib/api/fetch-alchemix-v2-positions";
import { v2ListingPath, v2PositionPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import {
  v2FiltersToFetchParams,
  v2ListDimensions,
  v2SortOptions,
  V2_ITEMS_PER_PAGE,
  V2_LIST_DEFAULTS,
  type V2ListFilters,
} from "@/lib/alchemix/v2-list-filter-dimensions";
import type { AlchemixV2PositionSummary } from "@/types/api/alchemix";

export interface AlchemixV2ListingProps {
  deployment: AlchemixDeployment;
  initialItems?: AlchemixV2PositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function AlchemixV2Listing({
  deployment,
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
}: AlchemixV2ListingProps) {
  return (
    <ChainTruthListingPage<AlchemixV2PositionSummary, V2ListFilters>
      title="Alchemix V2 Positions"
      noun="V2 positions"
      basePath={v2ListingPath(deployment)}
      identity={<RailHeader session={deployment.session} venue="listing" stamp />}
      titleHidden
      headerExtra={<AlchemixTypeTabs deployment={deployment} active="v2" />}
      bookmarksProtocol={deployment.session}
      defaults={V2_LIST_DEFAULTS}
      sortOptions={v2SortOptions}
      searchPlaceholder="Address"
      renderCard={(p) => <AlchemixV2PositionCard p={p} session={deployment.session} />}
      hrefFor={(p) => v2PositionPath(deployment, p.lineKey, p.account)}
      keyFor={(p) => `${p.lineKey}:${p.account}`}
      strategy={serverStrategy<AlchemixV2PositionSummary, V2ListFilters>({
        dimensions: v2ListDimensions(deployment.chainId),
        itemsPerPage: V2_ITEMS_PER_PAGE,
        fetchPage: async (filters, page) => {
          const res = await fetchAlchemixV2Positions(v2FiltersToFetchParams(deployment, filters, page));
          return { data: res.data, total: res.pagination.total };
        },
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
