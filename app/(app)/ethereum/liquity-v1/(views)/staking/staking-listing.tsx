"use client";

// Liquity V1 LQTY stakes — client half: the shared listing driver with the
// stake card's listing render (components/protocol/liquity/v1-staking-card.tsx).
// A stake is its staker, so the href and key are the address.

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { LiquityV1StakeCard } from "@/components/protocol/liquity/v1-staking-card";
import { liquityV1StakeHref, LIQUITY_V1_STAKING_PATH } from "@/lib/liquity-v1/staking-routes";
import {
  fetchStakePage,
  stListDimensions,
  stSortOptions,
  ST_ITEMS_PER_PAGE,
  ST_LIST_DEFAULTS,
  type StListFilters,
} from "@/lib/liquity-v1/staking-listing";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";

const SORT_OPTIONS = stSortOptions();

export function StakingListing(props: {
  initialItems?: LiquityV1StakeRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  return (
    <ChainTruthListingPage<LiquityV1StakeRow, StListFilters>
      title="Liquity V1 LQTY stakes"
      noun="Stakes"
      basePath={LIQUITY_V1_STAKING_PATH}
      identity={<RailHeader session="liquity-v1" venue="subPage" stamp />}
      titleHidden
      defaults={ST_LIST_DEFAULTS}
      sortOptions={SORT_OPTIONS}
      searchPlaceholder="Staker address or ENS"
      renderCard={(r) => <LiquityV1StakeCard row={r} surface="listing" />}
      hrefFor={(r) => liquityV1StakeHref(r.staker)}
      keyFor={(r) => r.staker}
      strategy={serverStrategy<LiquityV1StakeRow, StListFilters>({
        dimensions: stListDimensions(),
        itemsPerPage: ST_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchStakePage(f, page),
      })}
      {...props}
    />
  );
}
