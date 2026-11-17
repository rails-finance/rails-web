"use client";

// Polaris Stability Pool deposits — client half: the shared listing driver
// with the deposit card's listing render (polaris-deposit-card.tsx). A
// deposit is (market, token id), so the href and key are the pair.

import { useMemo } from "react";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RailHeader } from "@/components/shared/rail-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { PolarisDepositCard } from "@/components/protocol/polaris/polaris-deposit-card";
import { POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { polarisDepositHref, POLARIS_SP_PATH } from "@/lib/polaris/routes";
import {
  DEPOSIT_LIST_DEFAULTS,
  depositListDimensions,
  depositSortOptions,
  fetchDepositPage,
  SP_LOAN_ITEMS_PER_PAGE,
  type PolarisDepositFilters,
} from "@/lib/polaris/sp-loan-listing";
import type { PolarisDepositRow } from "@/lib/sources/api/polaris-sp-loans";

export function SpListing(props: {
  initialItems?: PolarisDepositRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  const marketOptions = useMemo<FilterOptionDef[]>(
    () =>
      Object.values(POLARIS_MARKET_CONFIG).map((cfg) => ({
        value: cfg.key,
        label: cfg.stable.symbol,
        icon: <TokenChipIcon symbol={cfg.stable.symbol} address={cfg.stable.address} size={20} filterable={false} />,
      })),
    [],
  );
  return (
    <ChainTruthListingPage<PolarisDepositRow, PolarisDepositFilters>
      title="Polaris Stability Pool deposits"
      noun="Deposits"
      basePath={POLARIS_SP_PATH}
      identity={<RailHeader session="polaris" venue="subPage" stamp />}
      titleHidden
      defaults={DEPOSIT_LIST_DEFAULTS}
      sortOptions={depositSortOptions}
      searchPlaceholder="Address, ENS, or deposit number (usdp:40)"
      renderCard={(r) => <PolarisDepositCard row={r} surface="listing" />}
      hrefFor={(r) => polarisDepositHref(r.market, r.token_id)}
      keyFor={(r) => `${r.market}:${r.token_id}`}
      strategy={serverStrategy<PolarisDepositRow, PolarisDepositFilters>({
        dimensions: depositListDimensions(marketOptions),
        itemsPerPage: SP_LOAN_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchDepositPage(f, page),
      })}
      {...props}
    />
  );
}
