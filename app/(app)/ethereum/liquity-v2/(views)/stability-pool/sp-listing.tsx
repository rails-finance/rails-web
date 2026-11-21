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
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import { useLiquityV2Prices } from "@/hooks/useLiquityV2Prices";
import { liquityV2HolderStrip } from "@/lib/liquity-v2/holder-strip";
import { LIQUITY_V2_ITEMS_PER_PAGE } from "@/lib/liquity-v2/list-filter-dimensions";
import { liquityV2DepositListingCard, liquityV2TroveKind } from "@/lib/liquity-v2/holder-kinds";
import { readListQuery } from "@/lib/shared/list-filter";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import type { TroveSummary } from "@/types/api/trove";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { liquityV2DepositHref, LIQUITY_V2_SP_PATH, SP_BRANCHES } from "@/lib/liquity-v2/sp-routes";
import {
  fetchSpPage,
  namesDepositor,
  spListDimensions,
  spSortOptions,
  SP_ITEMS_PER_PAGE,
  SP_LIST_DEFAULTS,
  type SpListFilters,
} from "@/lib/liquity-v2/sp-listing";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";

export function SpListing(props: {
  initialItems?: LiquityV2DepositRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
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
  // The wallet's Troves, under the rows and counted in the strip (rails-ops
  // TO-DO-stability-pool-deposits §1b). Their cards and totals carry USD at
  // the branch prices.
  const prices = useLiquityV2Prices();
  const otherKinds = useMemo(() => [liquityV2TroveKind(prices)], [prices]);
  const { reads } = useHolderKinds(otherKinds, readListQuery(useUrlSearchParams(props.initialSearch ?? "")));
  const troves = reads.trove;

  // The strip states the wallet: the search names a depositor, no pill
  // narrows the rows, and the Troves and the prices have landed.
  const holderStrip = (items: LiquityV2DepositRow[], total: number, f: SpListFilters) => {
    if (!namesDepositor(f.q) || f.status.length || f.branch.length || f.tx.length) return null;
    if (!prices || !troves || troves === "failed") return null;
    const t = troves as HolderKindPage<TroveSummary>;
    return (
      <HolderStrip
        {...liquityV2HolderStrip(t.rows, t.total, prices, LIQUITY_V2_ITEMS_PER_PAGE, t.passedOn ?? 0, f.q.trim(), {
          rows: items,
          total,
        })}
      />
    );
  };

  return (
    <ChainTruthListingPage<LiquityV2DepositRow, SpListFilters>
      title="Liquity V2 Stability Pool deposits"
      noun="Deposits"
      basePath={LIQUITY_V2_SP_PATH}
      identity={<RailHeader session="liquity-v2" venue="subPage" stamp />}
      titleHidden
      defaults={SP_LIST_DEFAULTS}
      sortOptions={spSortOptions}
      searchPlaceholder="Depositor address or ENS"
      renderCard={liquityV2DepositListingCard}
      hrefFor={(r) => liquityV2DepositHref(r.collateral_type, r.depositor)}
      keyFor={(r) => `${r.collateral_type}:${r.depositor}`}
      strategy={serverStrategy<LiquityV2DepositRow, SpListFilters>({
        dimensions: spListDimensions(branchOptions),
        itemsPerPage: SP_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchSpPage(f, page),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={(f) => <HolderKinds kinds={otherKinds} reads={reads} q={f.q} />}
      {...props}
    />
  );
}
