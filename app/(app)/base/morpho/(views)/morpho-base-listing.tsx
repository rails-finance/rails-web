"use client";

// Morpho Blue Base listing — client half. The shared listing driver pointed
// at the Base route, the shared Morpho card in its LISTED render (a chain
// read at one block, receipts naming the Base sweep, no principal and no
// peak), and the one thing the Ethereum listing never has to say: how
// complete the position set is.
//
// A row is one (market, borrower) pair, as on Ethereum: its collateral and
// its debt are the singleton's own slots read at the block the row names,
// and the borrow limit and health beside them are the market's own oracle at
// that same block put through the contract's own solvency test.
//
// The same listing, with `market` set, is the positions section of one
// market's page: the market rides every fetch, the token facets go, and the
// URL it keeps in sync is that page's own (lib/morpho-base/list-filter-
// dimensions.tsx, "fixed to one market").

import { useCallback, useRef } from "react";
import type { MorphoPositionSummary } from "@/lib/sources/api/morpho-positions";
import { fetchMorphoPositions } from "@/lib/api/fetch-morpho-positions";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { MorphoPositionCard, viewFromSummary } from "@/components/protocol/morpho/morpho-position-card";
import { MorphoMarketPageLine } from "@/components/protocol/morpho/morpho-market-link";
import { makeListedMorphoReceipts } from "@/lib/morpho/listed-card-provenance";
import { MORPHO_BASE_CHAIN_ID } from "@/lib/morpho-base/asset-catalog";
import { morphoBasePositionHref } from "@/lib/morpho-base/routes";
// A row's owner is any address the singleton has ever named, and a handful of
// them are catalogued MetaMorpho vaults, not people — 505 rows, ~26 KB
// gzipped. This is the one client component on the explorer that imports the
// catalog directly: the listing's rows are paged through a client fetch, so
// there is no server render to resolve it in first (contrast the wallet and
// position pages, which read it on the server and pass down only a name and
// an href). Base-only file, so nothing here reaches the Ethereum listing.
import { morphoBaseVaultOwnerNote } from "@/lib/morpho-base/vault-owner-note";
import {
  morphoBaseListDimensions,
  morphoBaseFiltersToFetchParams,
  morphoBaseMarketDefaults,
  morphoBaseMarketDimensions,
  morphoBaseMarketFetchParams,
  morphoBaseSearchTarget,
  morphoBaseSortOptions,
  MORPHO_BASE_ITEMS_PER_PAGE,
  MORPHO_BASE_LIST_DEFAULTS,
  MORPHO_BASE_POSITIONS_ROUTE,
  type MorphoBaseListFilters,
} from "@/lib/morpho-base/list-filter-dimensions";

export interface MorphoBaseListingProps {
  initialItems?: MorphoPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  /** Fix the listing to one market — its id, its loan token, and the path of
   *  the market page it is drawn on. */
  market?: { id: string; loanToken: string; path: string };
}

/** The receipts every card on this page cites: Rails' Base sweep, this route.
 *  Module-level, so the reference is stable across renders. */
const RECEIPTS = makeListedMorphoReceipts({
  chainId: MORPHO_BASE_CHAIN_ID,
  positionsRoute: MORPHO_BASE_POSITIONS_ROUTE,
});

export function MorphoBaseListing({
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
  market,
}: MorphoBaseListingProps) {
  const { setWallets } = useWalletContext();
  const lastIdentityRef = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: MorphoBaseListFilters) => {
      const wallet = morphoBaseSearchTarget(f.q).wallet ?? "";
      if (lastIdentityRef.current === wallet) return;
      lastIdentityRef.current = wallet;
      if (wallet) setWallets([wallet], { [wallet]: null });
    },
    [setWallets],
  );

  return (
    <ChainTruthListingPage<MorphoPositionSummary, MorphoBaseListFilters>
      title={market ? "Positions in this market" : "Morpho Blue Positions"}
      titleAs={market ? "h2" : undefined}
      noun="positions"
      basePath={market ? market.path : "/base/morpho"}
      bookmarksProtocol="morpho-base"
      defaults={market ? morphoBaseMarketDefaults(market.loanToken) : MORPHO_BASE_LIST_DEFAULTS}
      sortOptions={morphoBaseSortOptions}
      searchPlaceholder={market ? "Search wallet address" : "Search wallet address or market id"}
      renderCard={(p) => (
        <MorphoPositionCard
          v={{ ...viewFromSummary(p), vaultOwner: morphoBaseVaultOwnerNote(p.owner) }}
          session="morpho-base"
          listedReceipts={RECEIPTS}
        />
      )}
      hrefFor={(p) => morphoBasePositionHref(p.owner, p.marketId)}
      keyFor={(p) => p.positionId}
      strategy={serverStrategy<MorphoPositionSummary, MorphoBaseListFilters>({
        dimensions: market ? morphoBaseMarketDimensions : morphoBaseListDimensions,
        itemsPerPage: MORPHO_BASE_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchMorphoPositions(
            market
              ? morphoBaseMarketFetchParams(filters, page, market.id)
              : morphoBaseFiltersToFetchParams(filters, page),
          ).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
        // The Debt/Collateral sort only means anything once loanTokens has
        // narrowed to exactly one address (morphoBaseSortOptions gates the
        // menu on the same test); if the facet widens or clears while one of
        // them is selected, drop back to Recent activity rather than leave
        // the URL naming a sort the menu no longer offers.
        reconcile: (filters) =>
          filters.loanTokens.length !== 1 && (filters.sortBy === "debt" || filters.sortBy === "coll")
            ? { ...filters, sortBy: "recent" }
            : null,
      })}
      onFilters={onFilters}
      // A search that is exactly one market id gets that market's page, named
      // from the rows it returned.
      renderAbove={
        market
          ? undefined
          : ({ items, filters }) => {
              const id = morphoBaseSearchTarget(filters.q).market;
              const row = id ? items.find((p) => p.marketId.toLowerCase().replace(/^0x/, "") === id) : undefined;
              return row ? (
                <MorphoMarketPageLine label={row.marketLabel} marketId={row.marketId} loanToken={row.loanToken} />
              ) : null;
            }
      }
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
