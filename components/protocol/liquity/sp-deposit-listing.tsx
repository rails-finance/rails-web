"use client";

// A Stability Pool deposit listing on Liquity V2 or one of its forks
// (lib/liquity-v2/sp-deployment.ts) — the client half: the shared listing
// driver with the deposit card's listing render. A deposit is (branch,
// depositor), so the href and key are the pair. A depositor search opens the
// wallet page with the deployment chosen (`walletSearch`, ui-jobs 738).

import { useMemo, type ReactNode } from "react";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RailHeader } from "@/components/shared/rail-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import type { SessionProtocol } from "@/lib/shared/sessions";
import { spDepositHref, type SpDeployment } from "@/lib/liquity-v2/sp-deployment";
import {
  fetchSpPage,
  spListDimensions,
  spSortOptions,
  SP_ITEMS_PER_PAGE,
  SP_LIST_DEFAULTS,
  type SpListFilters,
} from "@/lib/liquity-v2/sp-listing";
import { spCountLine } from "@/lib/liquity-v2/sp-visibility";
import type { LiquityV2DepositRow } from "@/lib/sources/api/liquity-v2-sp";

export interface SpDepositListingProps {
  initialItems?: LiquityV2DepositRow<string>[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function SpDepositListing({
  dep,
  title,
  renderCard,
  ...props
}: SpDepositListingProps & {
  dep: SpDeployment;
  title: string;
  renderCard: (r: LiquityV2DepositRow<string>) => ReactNode;
}) {
  const branchOptions = useMemo<FilterOptionDef[]>(
    () =>
      dep.pools.map((p) => ({
        value: p.symbol,
        label: p.symbol,
        icon: <TokenChipIcon symbol={p.symbol} address={p.collateralAddr} size={20} filterable={false} />,
      })),
    [dep],
  );
  return (
    <ChainTruthListingPage<LiquityV2DepositRow<string>, SpListFilters>
      title={title}
      noun="Deposits"
      basePath={dep.spPath}
      identity={<RailHeader session={dep.session as SessionProtocol} venue="subPage" stamp />}
      titleHidden
      countLine={spCountLine}
      defaults={SP_LIST_DEFAULTS}
      sortOptions={(f) => spSortOptions(f, dep)}
      searchPlaceholder="Depositor address or ENS"
      renderCard={renderCard}
      hrefFor={(r) => spDepositHref(dep, r.collateral_type, r.depositor)}
      keyFor={(r) => `${r.collateral_type}:${r.depositor}`}
      strategy={serverStrategy<LiquityV2DepositRow<string>, SpListFilters>({
        dimensions: spListDimensions(branchOptions),
        itemsPerPage: SP_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchSpPage<string>(f, page, {}, dep),
        // A draft's total, one row asked (the editors' "Show N", ui-jobs 805).
        countDraft: (f) => fetchSpPage<string>(f, 1, { limit: 1 }, dep).then((r) => r.total),
      })}
      walletSearch={dep.id}
      {...props}
    />
  );
}
