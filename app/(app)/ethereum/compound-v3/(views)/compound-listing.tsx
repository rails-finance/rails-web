"use client";

// Compound V3 listing — client half. Holds the presentation config + the
// server-driven strategy and hands them to the shared ChainTruthListingPage driver
// with the SSR first-paint data from page.tsx.

import { useCallback, useRef } from "react";
import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { CompoundPositionCard, viewFromSummary } from "@/components/protocol/compound/compound-position-card";
import {
  compoundListDimensions,
  compoundFiltersToFetchParams,
  COMPOUND_LIST_DEFAULTS,
  COMPOUND_SORT_OPTIONS,
  COMPOUND_ITEMS_PER_PAGE,
  type CompoundListFilters,
} from "@/lib/compound/list-filter-dimensions";

export interface CompoundListingProps {
  initialItems?: CompoundPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function CompoundListing({ initialItems, initialTotal, initialKey, initialSearch }: CompoundListingProps) {
  // Wallet-view dispatch: surface the searched wallet in the header pill + recents,
  // the same seam Aave V4's listing uses. Guarded by the last identity so a
  // page/sort change doesn't re-dispatch. Compound's search is address-only (the
  // filter has no ENS layer — compoundFiltersToFetchParams passes q straight as
  // `wallet`), so this only dispatches on a well-formed 0x address.
  const { setWallets } = useWalletContext();
  const lastIdentityRef = useRef<string | null>(null);
  const onFilters = useCallback(
    (f: CompoundListFilters) => {
      const q = f.q.trim().toLowerCase();
      const wallet = /^0x[a-f0-9]{40}$/.test(q) ? q : "";
      if (lastIdentityRef.current === wallet) return;
      lastIdentityRef.current = wallet;
      if (wallet) setWallets([wallet], { [wallet]: null });
    },
    [setWallets],
  );

  return (
    <ChainTruthListingPage<CompoundPositionSummary, CompoundListFilters>
      title="Compound V3 Positions"
      noun="positions"
      basePath="/ethereum/compound-v3"
      bookmarksProtocol="compound"
      defaults={COMPOUND_LIST_DEFAULTS}
      sortOptions={COMPOUND_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => <CompoundPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/compound-v3/${p.market}/${p.account}`}
      keyFor={(p) => `${p.market}:${p.account}`}
      strategy={serverStrategy<CompoundPositionSummary, CompoundListFilters>({
        dimensions: compoundListDimensions(),
        itemsPerPage: COMPOUND_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchCompoundPositions(compoundFiltersToFetchParams(filters, page)).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
      })}
      onFilters={onFilters}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
