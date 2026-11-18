"use client";

// Liquity V2 Stability Pool deposits — client half: the shared listing driver
// with the deposit card's listing render (components/protocol/liquity/
// sp-deposit-card.tsx). A deposit is (branch, depositor), so the href and key
// are the pair.

import { useMemo } from "react";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RailHeader } from "@/components/shared/rail-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { LiquityV2DepositCard } from "@/components/protocol/liquity/sp-deposit-card";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { liquityV2DepositHref, LIQUITY_V2_SP_PATH, SP_BRANCHES } from "@/lib/liquity-v2/sp-routes";
import {
  fetchSpPage,
  spListDimensions,
  spSortOptions,
  SP_ITEMS_PER_PAGE,
  SP_LIST_DEFAULTS,
  type SpListFilters,
} from "@/lib/liquity-v2/sp-listing";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";
import { SpDepthStrip } from "@/components/protocol/liquity/sp-depth-strip";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import type { SpDepth } from "@/lib/liquity-v2/sp-depth";

export function SpListing({
  depth,
  ...props
}: {
  initialItems?: LiquityV2DepositRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
  /** The pools' depth per branch, read with the first page (ui-jobs 748). */
  depth?: SpDepth | null;
}) {
  const branchOptions = useMemo<FilterOptionDef[]>(
    () =>
      SP_BRANCHES.map((b) => {
        const addr = LIQUITY_V2_BRANCHES[b.toLowerCase()].collateralAddr;
        return {
          value: b,
          label: b,
          icon: <TokenChipIcon symbol={b} address={addr} size={20} filterable={false} />,
        };
      }),
    [],
  );
  return (
    <>
      <ChainTruthListingPage<LiquityV2DepositRow, SpListFilters>
        title="Liquity V2 Stability Pool deposits"
        noun="Deposits"
        basePath={LIQUITY_V2_SP_PATH}
        identity={<RailHeader session="liquity-v2" venue="subPage" stamp />}
        titleHidden
        headerExtra={depth !== undefined ? <SpDepthStrip depth={depth} className="mb-6" /> : undefined}
        defaults={SP_LIST_DEFAULTS}
        sortOptions={spSortOptions}
        searchPlaceholder="Depositor address or ENS"
        renderCard={(r) => <LiquityV2DepositCard row={r} surface="listing" />}
        hrefFor={(r) => liquityV2DepositHref(r.collateral_type, r.depositor)}
        keyFor={(r) => `${r.collateral_type}:${r.depositor}`}
        strategy={serverStrategy<LiquityV2DepositRow, SpListFilters>({
          dimensions: spListDimensions(branchOptions),
          itemsPerPage: SP_ITEMS_PER_PAGE,
          fetchPage: (f, page) => fetchSpPage(f, page),
        })}
        {...props}
      />
      {/* The depth table's receipts (ui-jobs 748): the listing shell mounts no inspector. */}
      <ProvInspectorLayer />
    </>
  );
}
