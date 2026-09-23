"use client";

// Vault positions on Ethereum — client half of /ethereum/aave/vaults/positions.
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
// TWO ROWS ABOVE THE TOOLBAR, AND NOTHING ELSE. The Aave vaults rail —
// identity, the chain head's recency stamp, VAULTS / (i) — then the census
// line. How the vault layer is built is at /ethereum/aave/vaults/info, and the
// provenance inspector is gone from this face: a listing card is inert content
// inside its row link, and the same card carries live receipts on the vault
// page.
//
// THE CENSUS HEADER TRAVELS WITH EVERY PAGE. Each response carries one census
// row per catalogued vault, so the `vault` menu is the whole catalogue and the
// block line is the census's own block — neither is ever sized from the twenty
// rows that happen to be on screen (memory `listing-truncation-and-timeline-axes`).
// It arrives with the SSR first paint and is refreshed by every client fetch.

import { useCallback, useState } from "react";

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { VaultPositionCard } from "@/components/vaults/vault-position-card";
import { VaultCensusLine } from "@/components/vaults/vault-census-line";
import { RailHeader } from "@/components/shared/rail-header";
import { fetchVaultPositions } from "@/lib/api/fetch-vault-positions";
import { ethereumVaultHref, ethereumVaultsListingHref } from "@/lib/vaults/routes";
import { vaultPositionKey, type VaultCensusRow, type VaultPositionRow } from "@/lib/aave-vaults/vault-position";
import {
  vaultPositionListDimensions,
  vaultPositionFiltersToFetchParams,
  VAULT_POSITION_LIST_DEFAULTS,
  VAULT_POSITION_SORT_OPTIONS,
  VAULT_POSITION_ITEMS_PER_PAGE,
  type VaultPositionListFilters,
} from "@/lib/aave-vaults/position-list-filter-dimensions";

export interface VaultPositionsListingProps {
  initialItems?: VaultPositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  initialCensus?: VaultCensusRow[];
  initialBlockNumber?: number | null;
}

export function VaultPositionsListing({
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
  initialCensus = [],
  initialBlockNumber = null,
}: VaultPositionsListingProps) {
  // The census header and the overlay's block, refreshed by every fetch the
  // driver makes. Seeded from SSR so the first paint carries both.
  const [census, setCensus] = useState<VaultCensusRow[]>(initialCensus);
  const [blockNumber, setBlockNumber] = useState<number | null>(initialBlockNumber);

  const fetchPage = useCallback((filters: VaultPositionListFilters, page: number) => {
    return fetchVaultPositions(vaultPositionFiltersToFetchParams(filters, page)).then((r) => {
      if (r.census.length > 0) setCensus(r.census);
      setBlockNumber(r.blockNumber);
      return { data: r.data, total: r.pagination.total };
    });
  }, []);

  return (
    <ChainTruthListingPage<VaultPositionRow, VaultPositionListFilters>
      title="Vault positions on Ethereum"
      identity={<RailHeader session="aave-vaults" venue="subPage" stamp />}
      titleHidden
      noun="vault positions"
      basePath={ethereumVaultsListingHref()}
      defaults={VAULT_POSITION_LIST_DEFAULTS}
      sortOptions={VAULT_POSITION_SORT_OPTIONS}
      searchPlaceholder="Holder address"
      headerExtra={<VaultCensusLine census={census} blockNumber={blockNumber} />}
      // The section's own bookmark namespace, not a protocol's: the toolbar's
      // search box gains this scope's bookmarks, and picking one filters the
      // listing to that address the way every rail's does.
      bookmarksProtocol="aave-vaults"
      renderCard={(row) => <VaultPositionCard row={row} />}
      // A card opens the vault's own page on this holder — the reading that
      // already exists, with the address's own timeline under it.
      hrefFor={(row) => ethereumVaultHref(row.vault, row.holder)}
      keyFor={vaultPositionKey}
      strategy={serverStrategy<VaultPositionRow, VaultPositionListFilters>({
        // Rebuilt per filter change so the vault chip's count follows the applied
        // Status filter (the census header carries all three counts).
        dimensions: (filters) => vaultPositionListDimensions(census, filters.status),
        itemsPerPage: VAULT_POSITION_ITEMS_PER_PAGE,
        fetchPage,
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
