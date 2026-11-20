"use client";

// Liquity V1 Stability Pool deposits — client half: the shared listing driver
// with the deposit card's listing render
// (components/protocol/liquity/v1-sp-deposit-card.tsx). A deposit is its
// depositor, so the href and key are the address.

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { LiquityV1DepositCard } from "@/components/protocol/liquity/v1-sp-deposit-card";
import { liquityV1DepositHref, LIQUITY_V1_SP_PATH } from "@/lib/liquity-v1/sp-routes";
import {
  fetchSpPage,
  spListDimensions,
  spSortOptions,
  SP_ITEMS_PER_PAGE,
  SP_LIST_DEFAULTS,
  type SpListFilters,
} from "@/lib/liquity-v1/sp-listing";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";

const SORT_OPTIONS = spSortOptions();

export function SpListing(props: {
  initialItems?: LiquityV1DepositRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  return (
    <ChainTruthListingPage<LiquityV1DepositRow, SpListFilters>
      title="Liquity V1 Stability Pool deposits"
      noun="Deposits"
      basePath={LIQUITY_V1_SP_PATH}
      identity={<RailHeader session="liquity-v1" venue="subPage" stamp />}
      titleHidden
      defaults={SP_LIST_DEFAULTS}
      sortOptions={SORT_OPTIONS}
      searchPlaceholder="Depositor address or ENS"
      renderCard={(r) => <LiquityV1DepositCard row={r} surface="listing" />}
      hrefFor={(r) => liquityV1DepositHref(r.depositor)}
      keyFor={(r) => r.depositor}
      strategy={serverStrategy<LiquityV1DepositRow, SpListFilters>({
        dimensions: spListDimensions(),
        itemsPerPage: SP_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchSpPage(f, page),
      })}
      {...props}
    />
  );
}
