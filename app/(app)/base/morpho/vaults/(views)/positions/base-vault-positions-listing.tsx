"use client";

// Vault positions on Base — client half of /base/morpho/vaults/positions.
// ----------------------------------------------------------------------------
// The roster of vaults is the page above this one (the VAULTS tab); this lists
// every position in those vaults, and each vault's market view is one click on
// a card's vault name.
//
// Config only: the presentation (card, href, key), the server-driven strategy,
// the explorer's rail header in the driver's `identity` slot and the one census
// line in its `headerExtra` slot. The shared ChainTruthListingPage driver owns
// the toolbar, the URL, the debounced search, pagination and the fetch
// lifecycle.
//
// TWO ROWS ABOVE THE TOOLBAR, AND NOTHING ELSE. The Morpho Blue Base rail —
// identity, the chain head's recency stamp, POSITIONS / MARKETS / VAULTS / (i)
// — then the census line. How the vault layer is built is at
// /base/morpho/vaults/info, and the provenance inspector is gone from this
// face: a listing card is inert content inside its row link, and the same card
// carries live receipts on the position page.
//
// THE CENSUS HEADER TRAVELS WITH EVERY PAGE. Each response carries one census
// row per catalogued vault — 511 of them — so the `vault` menu is sized from
// the census and the block line is the census's own block; neither is ever
// sized from the twenty rows that happen to be on screen (memory
// `listing-truncation-and-timeline-axes`). It arrives with the SSR first paint
// and is refreshed by every client fetch.
//
// AND THE COUNT OF VAULTS IS THE HELD ONES. 268 of the catalogue have never had
// a single `Transfer`, so "positions across N vaults" names the vaults those
// positions are actually in. Those never-held vaults are absent from the vault
// MENU, because a facet option that always answers an empty page says nothing,
// and present in the roster as "no holder yet" — a chain reading with its own
// block.

import { useCallback, useState } from "react";

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { VaultPositionCard } from "@/components/vaults/vault-position-card";
import { VaultCensusLine } from "@/components/vaults/vault-census-line";
import { RailHeader } from "@/components/shared/rail-header";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { baseVaultHref, baseVaultsListingHref } from "@/lib/vaults/routes";
import { vaultPositionKey, type VaultCensusRow, type VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import {
  baseVaultPositionListDimensions,
  baseVaultPositionFiltersToFetchParams,
  BASE_VAULT_POSITION_LIST_DEFAULTS,
  BASE_VAULT_POSITION_SORT_OPTIONS,
  BASE_VAULT_POSITION_ITEMS_PER_PAGE,
  type BaseVaultPositionListFilters,
} from "@/lib/morpho-base/position-list-filter-dimensions";

export interface BaseVaultPositionsListingProps {
  initialItems?: VaultPositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  initialCensus?: VaultCensusRow[];
  initialBlockNumber?: number | null;
}

export function BaseVaultPositionsListing({
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
  initialCensus = [],
  initialBlockNumber = null,
}: BaseVaultPositionsListingProps) {
  // The census header and the block the overlay read the cards at, refreshed by
  // every fetch the driver makes. Seeded from SSR so the first paint carries
  // both. The lane's `finalized` block rides the same response and is NOT held
  // here: nothing on this face states it, and the page that does — a position,
  // beside the cards it is about — reads it in its own request.
  const [census, setCensus] = useState<VaultCensusRow[]>(initialCensus);
  const [blockNumber, setBlockNumber] = useState<number | null>(initialBlockNumber);

  const fetchPage = useCallback((filters: BaseVaultPositionListFilters, page: number) => {
    return fetchVaultPositions(baseVaultPositionFiltersToFetchParams(filters, page)).then((r) => {
      if (r.census.length > 0) setCensus(r.census);
      setBlockNumber(r.blockNumber);
      return { data: r.data, total: r.pagination.total };
    });
  }, []);

  return (
    <ChainTruthListingPage<VaultPositionRow, BaseVaultPositionListFilters>
      title="Vault positions on Base"
      identity={<RailHeader session="morpho-base" venue="subPage" stamp />}
      titleHidden
      noun="vault positions"
      basePath={baseVaultsListingHref()}
      defaults={BASE_VAULT_POSITION_LIST_DEFAULTS}
      sortOptions={BASE_VAULT_POSITION_SORT_OPTIONS}
      searchPlaceholder="Holder address"
      headerExtra={<VaultCensusLine census={census} blockNumber={blockNumber} countHeldOnly />}
      // The explorer's own bookmark namespace: the toolbar's search box gains
      // Morpho Blue Base's bookmarks, and picking one filters the listing to
      // that address the way every rail's does.
      bookmarksProtocol="morpho-base"
      renderCard={(row) => <VaultPositionCard row={row} />}
      // A card opens that pair's own page — the position, with its lifetime
      // flows and its own timeline under it.
      hrefFor={(row) => baseVaultHref(row.vault, row.holder)}
      keyFor={vaultPositionKey}
      strategy={serverStrategy<VaultPositionRow, BaseVaultPositionListFilters>({
        // Rebuilt per filter change so the vault chip's count follows the applied
        // Status filter (the census header carries all three counts).
        dimensions: (filters) => baseVaultPositionListDimensions(census, filters.status),
        itemsPerPage: BASE_VAULT_POSITION_ITEMS_PER_PAGE,
        fetchPage,
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
