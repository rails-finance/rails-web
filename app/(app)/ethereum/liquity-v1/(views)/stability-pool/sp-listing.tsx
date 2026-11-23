"use client";

// Liquity V1 Stability Pool deposits — client half: the shared listing driver
// with the deposit card's listing render
// (components/protocol/liquity/v1-sp-deposit-card.tsx). A deposit is its
// depositor, so the href and key are the address.

import { spCountLine } from "@/lib/liquity-v1/sp-staking-visibility";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { liquityV1DepositHref, LIQUITY_V1_SP_PATH } from "@/lib/liquity-v1/sp-routes";
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import { LIQUITY_V1_ITEMS_PER_PAGE } from "@/lib/liquity-v1/list-filter-dimensions";
import { liquityV1HolderStrip } from "@/lib/liquity-v1/holder-strip";
import { LIQUITY_V1_STAKES, LIQUITY_V1_TROVES, liquityV1DepositListingCard } from "@/lib/liquity-v1/holder-kinds";
import type { LiquityV1StakeRow } from "@/lib/sources/api/liquity-v1-staking";
import { readListQuery } from "@/lib/shared/list-filter";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import {
  fetchSpPage,
  namesDepositor,
  spListDimensions,
  spSortOptions,
  SP_ITEMS_PER_PAGE,
  SP_LIST_DEFAULTS,
  type SpListFilters,
} from "@/lib/liquity-v1/sp-listing";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";

const SORT_OPTIONS = spSortOptions();
const OTHER_KINDS = [LIQUITY_V1_TROVES, LIQUITY_V1_STAKES];

export function SpListing(props: {
  initialItems?: LiquityV1DepositRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  // The wallet's Troves and stake, under the rows and counted in the strip
  // (§1b, §6).
  const q = readListQuery(useUrlSearchParams(props.initialSearch ?? ""));
  const { wallet, reads } = useHolderKinds(OTHER_KINDS, q);
  const troves = reads[LIQUITY_V1_TROVES.id];
  const stakes = reads[LIQUITY_V1_STAKES.id];

  // The strip states the wallet: the search names a depositor and no pill
  // narrows the rows. It waits for the Troves' and the stake's reads; a
  // failed one leaves its kind unsaid.
  const holderStrip = (items: LiquityV1DepositRow[], total: number, f: SpListFilters) =>
    namesDepositor(f.q) && f.status.length === 0 && !f.tx.length && troves !== undefined && stakes !== undefined ? (
      <HolderStrip
        {...liquityV1HolderStrip(
          troves === "failed" ? undefined : (troves as HolderKindPage<LiquityV1PositionSummary>),
          { rows: items, total },
          LIQUITY_V1_ITEMS_PER_PAGE,
          f.q.trim(),
          stakes === "failed" ? undefined : (stakes as HolderKindPage<LiquityV1StakeRow>),
        )}
      />
    ) : null;

  return (
    <ChainTruthListingPage<LiquityV1DepositRow, SpListFilters>
      title="Liquity V1 Stability Pool deposits"
      noun="Deposits"
      basePath={LIQUITY_V1_SP_PATH}
      identity={<RailHeader session="liquity-v1" venue="subPage" stamp />}
      titleHidden
      countLine={spCountLine}
      defaults={SP_LIST_DEFAULTS}
      sortOptions={SORT_OPTIONS}
      searchPlaceholder="Depositor address or ENS"
      renderCard={liquityV1DepositListingCard}
      hrefFor={(r) => liquityV1DepositHref(r.depositor)}
      keyFor={(r) => r.depositor}
      strategy={serverStrategy<LiquityV1DepositRow, SpListFilters>({
        dimensions: spListDimensions(),
        itemsPerPage: SP_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchSpPage(f, page),
        // A draft's total, one row asked (the editors' "Show N", ui-jobs 805).
        countDraft: (f) => fetchSpPage(f, 1, { limit: 1 }).then((r) => r.total),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={() => <HolderKinds kinds={OTHER_KINDS} reads={reads} wallet={wallet} />}
      {...props}
    />
  );
}
