"use client";

// Liquity V1 LQTY stakes — client half: the shared listing driver with the
// stake card's listing render (components/protocol/liquity/v1-staking-card.tsx).
// A stake is its staker, so the href and key are the address. A search that
// names a staker states the wallet's Troves and deposit under the rows and
// counts them in the strip (§1b, §6).

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { liquityV1StakeHref, LIQUITY_V1_STAKING_PATH } from "@/lib/liquity-v1/staking-routes";
import {
  fetchStakePage,
  namesStaker,
  stListDimensions,
  stSortOptions,
  ST_ITEMS_PER_PAGE,
  ST_LIST_DEFAULTS,
  type StListFilters,
} from "@/lib/liquity-v1/staking-listing";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import { LIQUITY_V1_DEPOSITS, LIQUITY_V1_TROVES, liquityV1StakeListingCard } from "@/lib/liquity-v1/holder-kinds";
import { liquityV1HolderStrip } from "@/lib/liquity-v1/holder-strip";
import { LIQUITY_V1_ITEMS_PER_PAGE } from "@/lib/liquity-v1/list-filter-dimensions";
import { readListQuery } from "@/lib/shared/list-filter";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";

const SORT_OPTIONS = stSortOptions();
const OTHER_KINDS = [LIQUITY_V1_TROVES, LIQUITY_V1_DEPOSITS];

export function StakingListing(props: {
  initialItems?: LiquityV1StakeRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  const q = readListQuery(useUrlSearchParams(props.initialSearch ?? ""));
  const { wallet, reads } = useHolderKinds(OTHER_KINDS, q);
  const troves = reads[LIQUITY_V1_TROVES.id];
  const deposits = reads[LIQUITY_V1_DEPOSITS.id];

  // The strip states the wallet: the search names a staker and no pill
  // narrows the rows. It waits for the other kinds' reads; a failed one leaves
  // its kind unsaid.
  const holderStrip = (items: LiquityV1StakeRow[], total: number, f: StListFilters) =>
    namesStaker(f.q) && f.status.length === 0 && !f.tx.length && troves !== undefined && deposits !== undefined ? (
      <HolderStrip
        {...liquityV1HolderStrip(
          troves === "failed" ? undefined : (troves as HolderKindPage<LiquityV1PositionSummary>),
          deposits === "failed" ? undefined : (deposits as HolderKindPage<LiquityV1DepositRow>),
          LIQUITY_V1_ITEMS_PER_PAGE,
          f.q.trim(),
          { rows: items, total },
        )}
      />
    ) : null;

  return (
    <ChainTruthListingPage<LiquityV1StakeRow, StListFilters>
      title="Liquity V1 LQTY stakes"
      noun="LQTY stakes"
      basePath={LIQUITY_V1_STAKING_PATH}
      identity={<RailHeader session="liquity-v1" venue="subPage" stamp />}
      titleHidden
      defaults={ST_LIST_DEFAULTS}
      sortOptions={SORT_OPTIONS}
      searchPlaceholder="Staker address or ENS"
      renderCard={liquityV1StakeListingCard}
      hrefFor={(r) => liquityV1StakeHref(r.staker)}
      keyFor={(r) => r.staker}
      strategy={serverStrategy<LiquityV1StakeRow, StListFilters>({
        dimensions: stListDimensions(),
        itemsPerPage: ST_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchStakePage(f, page),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={() => <HolderKinds kinds={OTHER_KINDS} reads={reads} wallet={wallet} />}
      {...props}
    />
  );
}
