"use client";

// The Transmuter position listing, the second type tab of an Alchemix explorer.
//
// Same driver, same deployment record, same chain gate as the Alchemist listing
// beside it. It is a route of its own under the explorer rather than a roster
// entry (rails-ops TO-DO-alchemix-scoping §8.4), so no roster href resolves to
// it: the explorer's rail header is handed in as the identity, the way a
// section that draws its own rail does, and the Positions tab stays lit.

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { AlchemixTypeTabs } from "@/components/protocol/alchemix/alchemix-type-tabs";
import { TransmuterPositionCard } from "@/components/protocol/alchemix/transmuter-position-card";
import { fetchAlchemixTransmuterPositions } from "@/lib/api/fetch-alchemix-transmuter-positions";
import { transmuterListingPath, transmuterPositionPath, type AlchemixDeployment } from "@/lib/alchemix/lines";
import {
  transmuterFiltersToFetchParams,
  transmuterListDimensions,
  transmuterSortOptions,
  TRANSMUTER_ITEMS_PER_PAGE,
  TRANSMUTER_LIST_DEFAULTS,
  type TransmuterListFilters,
} from "@/lib/alchemix/transmuter-list-filter-dimensions";
import type { AlchemixTransmuterPositionSummary } from "@/types/api/alchemix";

export interface TransmuterListingProps {
  deployment: AlchemixDeployment;
  initialItems?: AlchemixTransmuterPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function TransmuterListing({
  deployment,
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
}: TransmuterListingProps) {
  return (
    <ChainTruthListingPage<AlchemixTransmuterPositionSummary, TransmuterListFilters>
      title="Alchemix Transmuter Positions"
      noun="Transmuter positions"
      basePath={transmuterListingPath(deployment)}
      identity={<RailHeader session={deployment.session} venue="listing" stamp />}
      titleHidden
      headerExtra={<AlchemixTypeTabs deployment={deployment} active="transmuter" />}
      bookmarksProtocol={deployment.session}
      defaults={TRANSMUTER_LIST_DEFAULTS}
      sortOptions={transmuterSortOptions}
      searchPlaceholder="Address or position id"
      renderCard={(p) => <TransmuterPositionCard p={p} session={deployment.session} />}
      hrefFor={(p) => transmuterPositionPath(deployment, p.lineKey, p.nftId)}
      keyFor={(p) => `${p.lineKey}:${p.nftId}`}
      strategy={serverStrategy<AlchemixTransmuterPositionSummary, TransmuterListFilters>({
        dimensions: transmuterListDimensions(deployment.chainId),
        itemsPerPage: TRANSMUTER_ITEMS_PER_PAGE,
        fetchPage: async (filters, page) => {
          const res = await fetchAlchemixTransmuterPositions(transmuterFiltersToFetchParams(deployment, filters, page));
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
