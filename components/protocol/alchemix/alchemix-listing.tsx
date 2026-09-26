"use client";

// The Alchemix position listing — client half, shared by both explorers.
//
// ONE COMPONENT, TWO EXPLORERS. `/ethereum/alchemix` and `/base/alchemix` are
// separate roster entries with separate sessions, because a position's identity
// is the (chain, line) pair and a token id on one chain says nothing about the
// same number on the other. What they do NOT need is two copies of this config:
// the deployment record carries the chain, the route, the session key and the
// lines, and every chain-dependent thing below is read from it. A line facet is
// built from the deployment's own lines, so neither explorer can offer the
// other's line, and the chain rides every fetch.
//
// The rail header, the toolbar, pagination, the debounced search and the fetch
// lifecycle all belong to the shared driver. This file is the Alchemix config.

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { AlchemixPositionCard } from "@/components/protocol/alchemix/alchemix-position-card";
import { fetchAlchemixPositions } from "@/lib/api/fetch-alchemix-positions";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import {
  alchemixFiltersToFetchParams,
  alchemixListDimensions,
  alchemixSortOptions,
  ALCHEMIX_ITEMS_PER_PAGE,
  ALCHEMIX_LIST_DEFAULTS,
  type AlchemixListFilters,
} from "@/lib/alchemix/list-filter-dimensions";
import type { AlchemixPositionSummary } from "@/types/api/alchemix";

export interface AlchemixListingProps {
  deployment: AlchemixDeployment;
  initialItems?: AlchemixPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function AlchemixListing({
  deployment,
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
}: AlchemixListingProps) {
  return (
    <ChainTruthListingPage<AlchemixPositionSummary, AlchemixListFilters>
      title="Alchemix Positions"
      noun="positions"
      basePath={deployment.basePath}
      bookmarksProtocol={deployment.session}
      defaults={ALCHEMIX_LIST_DEFAULTS}
      sortOptions={alchemixSortOptions}
      searchPlaceholder="Address or position id"
      renderCard={(p) => <AlchemixPositionCard p={p} session={deployment.session} />}
      // Both halves of the key, always: a token id is unique only inside its
      // line, and the line is unique only on its chain. The position route
      // takes the pair in its path and checks the line against the chain
      // before it reads anything.
      hrefFor={(p) => `${deployment.basePath}/${encodeURIComponent(p.lineKey)}/${p.tokenId}`}
      keyFor={(p) => `${p.lineKey}:${p.tokenId}`}
      strategy={serverStrategy<AlchemixPositionSummary, AlchemixListFilters>({
        dimensions: alchemixListDimensions(deployment.chainId),
        itemsPerPage: ALCHEMIX_ITEMS_PER_PAGE,
        fetchPage: async (filters, page) => {
          const res = await fetchAlchemixPositions(alchemixFiltersToFetchParams(deployment, filters, page));
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
