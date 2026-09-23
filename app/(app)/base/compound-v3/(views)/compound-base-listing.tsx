"use client";

// Compound V3 Base listing — client half. The shared Compound listing driver
// pointed at the Base route, the shared Compound card bound to the Base lane
// (session, swept receipts, Basescan, no replay peaks), and the one thing the
// Ethereum listing never has to say: how complete the lane is.
//
// A row is one (Comet, account) pair, as on Ethereum; the position page here
// is per WALLET and answers every market at once, so several rows for one
// wallet open the same page.

import { useCallback, useRef } from "react";
import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import { fetchCompoundPositions } from "@/lib/api/fetch-compound-positions";
import { useWalletContext } from "@/components/nav/wallet-context";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import {
  CompoundPositionCard,
  viewFromSummary,
  type CompoundCardLane,
} from "@/components/protocol/compound/compound-position-card";
import { COMPOUND_SWEPT_VOCABULARY } from "@/lib/compound/swept-tower-provenance";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import {
  compoundBaseListDimensions,
  compoundBaseFiltersToFetchParams,
  COMPOUND_BASE_LIST_DEFAULTS,
  COMPOUND_BASE_SORT_OPTIONS,
} from "@/lib/compound-base/list-filter-dimensions";
import { COMPOUND_ITEMS_PER_PAGE, type CompoundListFilters } from "@/lib/compound/list-filter-dimensions";

export interface CompoundBaseListingProps {
  initialItems?: CompoundPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

const LANE: CompoundCardLane = { chainId: BASE_CHAIN_ID, source: "sweep" };

export function CompoundBaseListing({
  initialItems,
  initialTotal,
  initialKey,
  initialSearch,
}: CompoundBaseListingProps) {
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
      basePath="/base/compound-v3"
      bookmarksProtocol="compound-base"
      defaults={COMPOUND_BASE_LIST_DEFAULTS}
      sortOptions={COMPOUND_BASE_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={(p) => (
        <CompoundPositionCard
          v={viewFromSummary(p)}
          vocab={COMPOUND_SWEPT_VOCABULARY}
          session="compound-base"
          lane={LANE}
          peaks={false}
        />
      )}
      hrefFor={(p) => `/base/compound-v3/${p.account}`}
      keyFor={(p) => `${p.market}:${p.account}`}
      strategy={serverStrategy<CompoundPositionSummary, CompoundListFilters>({
        dimensions: compoundBaseListDimensions(),
        itemsPerPage: COMPOUND_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchCompoundPositions(compoundBaseFiltersToFetchParams(filters, page)).then((r) => ({
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
