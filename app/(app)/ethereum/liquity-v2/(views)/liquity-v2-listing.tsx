"use client";

// Liquity V2 Trove listing — client half. Holds the presentation config (card / href) + the server-driven strategy and hands them to the shared
// ChainTruthListingPage driver along with the SSR first-paint data from page.tsx.
// The driver owns the toolbar, pagination, debounced search, URL and the fetch
// lifecycle; this file is just the V2-specific config plus the oracle-price
// side-fetch (USD on the open cards), passed into renderCard. A search by a
// whole address or an ENS name opens the wallet page (`walletSearch`, ui-jobs 738).
//
// Graduated from the old bespoke TrovesPageContent (decision 0009): the framer
// entrance, hand-rolled URL encode/decode, manual pagination and direct
// next/navigation useSearchParams (the hidden-dup hydration source) are all gone —
// the shared driver + useUrlSearchParams replace them, and this now SSR-first-paints
// like the rest of the tier.

import { useMemo, useState } from "react";
import { troveWords } from "@/lib/liquity/event-templates";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { fetchTroves } from "@/lib/api/fetch-troves";
import type { TroveSummary } from "@/types/api/trove";
import { liquityV2TroveCard, liquityV2TroveHref, liquityV2TroveKey } from "@/lib/liquity-v2/listing-cards";
import { useLiquityV2Prices } from "@/hooks/useLiquityV2Prices";
import { useLiquityV2BranchCcr } from "@/hooks/useLiquityV2BranchCcr";
import { BranchCcrNotice } from "@/components/protocol/liquity/branch-ccr-notice";
import { normalizeCcrBranch } from "@/lib/liquity-v2/branch-ccr";
import {
  liquityV2ListDimensions,
  liquityV2FiltersToFetchParams,
  LIQUITY_V2_LIST_DEFAULTS,
  LIQUITY_V2_SORT_OPTIONS,
  LIQUITY_V2_ITEMS_PER_PAGE,
  LIQUITY_V2_COLLATERAL_TYPES,
  type LiquityV2ListFilters,
} from "@/lib/liquity-v2/list-filter-dimensions";

export interface LiquityV2ListingProps {
  initialItems?: TroveSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function LiquityV2Listing({ initialItems, initialTotal, initialKey, initialSearch }: LiquityV2ListingProps) {
  // The branch prices: USD on the open cards. Outside the driver's fetch
  // lifecycle, so its landing never refetches the listing.
  const prices = useLiquityV2Prices();

  // The branches against their CCR (ui-jobs 747): a branch the listing is
  // narrowed to draws its Safety Mode notice above the rows. The read runs
  // once a Collateral facet is selected (set from onFilters below).
  const [collateralFacet, setCollateralFacet] = useState(false);
  const branchCcr = useLiquityV2BranchCcr(collateralFacet);

  // Collateral facet options carry the token-icon chip (matches the position view).
  const collateralOptions = useMemo<FilterOptionDef[]>(
    () =>
      LIQUITY_V2_COLLATERAL_TYPES.map((type) => ({
        value: type,
        label: type,
        icon: <TokenChipIcon symbol={type} size={20} filterable={false} />,
      })),
    [],
  );

  return (
    <ChainTruthListingPage<TroveSummary, LiquityV2ListFilters>
      title={troveWords("listing_title")}
      noun={troveWords("listing_noun")}
      basePath="/ethereum/liquity-v2"
      defaults={LIQUITY_V2_LIST_DEFAULTS}
      sortOptions={LIQUITY_V2_SORT_OPTIONS}
      searchPlaceholder={troveWords("listing_search")}
      renderCard={(t) => liquityV2TroveCard(t, prices)}
      hrefFor={liquityV2TroveHref}
      keyFor={liquityV2TroveKey}
      strategy={serverStrategy<TroveSummary, LiquityV2ListFilters>({
        dimensions: liquityV2ListDimensions(collateralOptions),
        itemsPerPage: LIQUITY_V2_ITEMS_PER_PAGE,
        fetchPage: (filters, page) =>
          fetchTroves(liquityV2FiltersToFetchParams(filters, page)).then((r) => ({
            data: r.data,
            total: r.pagination.total,
          })),
      })}
      walletSearch="liquity-v2"
      onFilters={(f) => setCollateralFacet((f.collateralTypes?.length ?? 0) > 0)}
      renderAbove={({ filters }) =>
        (filters.collateralTypes ?? []).map((t) => {
          const b = normalizeCcrBranch(t);
          return b ? <BranchCcrNotice key={b} state={branchCcr[b]} anatomy="N8·liquity" /> : null;
        })
      }
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
