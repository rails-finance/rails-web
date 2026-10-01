"use client";

// Seamless listing — client half. The shared Aave V3 listing driver pointed at
// the Seamless route. The closed-market framing and the completeness statement
// (base-lending-coverage-banner) live on the rail's /info page with the rest
// of the intro prose.

import { aaveV3RestingCountLine } from "@/lib/aave-v3/listing-visibility";
import { fetchAaveV3Positions, type AaveV3PositionRow } from "@/lib/api/fetch-aave-v3-positions";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { AaveV3PositionCard, viewFromSummary } from "@/components/protocol/aave-v3/aave-v3-position-card";
import { SEAMLESS_FREEZE_BLOCK, SEAMLESS_FREEZE_DATE, SEAMLESS_FREEZE_TX } from "@/lib/seamless/asset-catalog";
import { SEAMLESS_CARD_DEPLOYMENT } from "@/lib/seamless/position-provenance";
import { BASE_CHAIN_ID, explorerUrl } from "@/lib/shared/chains";
import {
  seamlessListDimensions,
  seamlessFiltersToFetchParams,
  SEAMLESS_LIST_DEFAULTS,
  SEAMLESS_SORT_OPTIONS,
} from "@/lib/seamless/list-filter-dimensions";
import { AAVE_V3_ITEMS_PER_PAGE, type AaveV3ListFilters } from "@/lib/aave-v3/list-filter-dimensions";

/** What the listing's counts count, in their tips. The listing counts the
 *  wallet's Pool calls; the position page also counts its aToken transfers. */
const LISTING_COUNT_RULE =
  "Pool calls only. aToken transfers, withdrawals as ETH through the WETH gateway among them, count on the position page";
const LIQUIDATION_RULE =
  "Each time a liquidator repaid part of the account's debt and took collateral in return. An account that is still open can be liquidated again";

export interface SeamlessListingProps {
  initialItems?: AaveV3PositionRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function SeamlessListing({ initialItems, initialTotal, initialKey, initialSearch }: SeamlessListingProps) {
  return (
    <ChainTruthListingPage<AaveV3PositionRow, AaveV3ListFilters>
      title="Seamless Positions"
      noun="positions"
      countLine={aaveV3RestingCountLine}
      basePath="/base/seamless"
      bookmarksProtocol="seamless"
      defaults={SEAMLESS_LIST_DEFAULTS}
      sortOptions={SEAMLESS_SORT_OPTIONS}
      searchPlaceholder="Search wallet address"
      // No replay lane behind a listing row: a closed row's "highest recorded"
      // says so rather than dashing as if nothing was ever held.
      renderCard={(p) => (
        <AaveV3PositionCard
          v={{ ...viewFromSummary(p), countRule: LISTING_COUNT_RULE, liquidationRule: LIQUIDATION_RULE }}
          deployment={SEAMLESS_CARD_DEPLOYMENT}
          peaks={false}
        />
      )}
      hrefFor={(p) => `/base/seamless/${p.wallet}`}
      keyFor={(p) => p.wallet}
      strategy={serverStrategy<AaveV3PositionRow, AaveV3ListFilters>({
        dimensions: seamlessListDimensions(),
        itemsPerPage: AAVE_V3_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchAaveV3Positions(seamlessFiltersToFetchParams(filters, page)).then((r) => ({
            data: r.rows,
            total: r.total,
          })),
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
