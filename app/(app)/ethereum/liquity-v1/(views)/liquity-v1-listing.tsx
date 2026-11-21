"use client";

// Liquity V1 Trove listing — client half. One row per Trove, replayed straight from
// the Liquity V1 TroveUpdated events — chain-direct values only (ETH collateral +
// LUSD debt, status). Liquity V1 is interest-free, so the debt shown is exact; the
// detail page adds the live-read risk surfaces (ratio, runway, queue). Holds the
// presentation config + the server-driven strategy and hands them to the shared
// ChainTruthListingPage driver with the SSR first-paint data from page.tsx; the
// driver owns the toolbar, pagination, debounced search and the fetch lifecycle.

import type { LiquityV1PositionSummary } from "@/lib/sources/api/liquity-v1-positions";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { readListQuery } from "@/lib/shared/list-filter";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import type { LiquityV1DepositRow } from "@/lib/sources/api/liquity-v1-sp";
import { liquityV1HolderStrip } from "@/lib/liquity-v1/holder-strip";
import {
  LIQUITY_V1_DEPOSITS,
  liquityV1TroveCard,
  liquityV1TroveHref,
  liquityV1TroveKey,
} from "@/lib/liquity-v1/holder-kinds";
import {
  liquityV1ListDimensions,
  liquityV1FiltersToFetchParams,
  liquityV1ListDefaults,
  LIQUITY_V1_SORT_OPTIONS,
  LIQUITY_V1_ITEMS_PER_PAGE,
  type LiquityV1ListFilters,
} from "@/lib/liquity-v1/list-filter-dimensions";

export interface LiquityV1ListingProps {
  initialItems?: LiquityV1PositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

const OTHER_KINDS = [LIQUITY_V1_DEPOSITS];
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function LiquityV1Listing({ initialItems, initialTotal, initialKey, initialSearch }: LiquityV1ListingProps) {
  // A wallet search rests on every status (liquityV1ListDefaults).
  const q = readListQuery(useUrlSearchParams(initialSearch ?? ""));
  const defaults = liquityV1ListDefaults(q);
  // The wallet's deposit, under the rows and counted in the strip (§1b).
  const { wallet, reads } = useHolderKinds(OTHER_KINDS, q);
  const deposits = reads[LIQUITY_V1_DEPOSITS.id];

  // The strip states the wallet, so it mounts only where the page is the
  // wallet's whole set of Troves: the search names an address and no pill
  // narrows the rows. It waits for the deposit's read; a failed one leaves
  // the deposit unsaid.
  const holderStrip = (items: LiquityV1PositionSummary[], total: number, f: LiquityV1ListFilters) =>
    ADDRESS.test(f.q.trim()) &&
    f.status.length === 0 &&
    !f.liquidations.length &&
    !f.redemptions.length &&
    !f.debt.length &&
    !f.coll.length &&
    !f.tx.length &&
    deposits !== undefined ? (
      <HolderStrip
        {...liquityV1HolderStrip(
          { rows: items, total },
          deposits === "failed" ? undefined : (deposits as HolderKindPage<LiquityV1DepositRow>),
          LIQUITY_V1_ITEMS_PER_PAGE,
          f.q.trim(),
        )}
      />
    ) : null;

  return (
    <ChainTruthListingPage<LiquityV1PositionSummary, LiquityV1ListFilters>
      title="Liquity V1 Troves"
      noun="Troves"
      basePath="/ethereum/liquity-v1"
      defaults={defaults}
      sortOptions={LIQUITY_V1_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      renderCard={liquityV1TroveCard}
      hrefFor={liquityV1TroveHref}
      keyFor={liquityV1TroveKey}
      strategy={serverStrategy<LiquityV1PositionSummary, LiquityV1ListFilters>({
        dimensions: liquityV1ListDimensions(),
        itemsPerPage: LIQUITY_V1_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchLiquityV1Positions(liquityV1FiltersToFetchParams(filters, page)).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={() => <HolderKinds kinds={OTHER_KINDS} reads={reads} wallet={wallet} />}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
