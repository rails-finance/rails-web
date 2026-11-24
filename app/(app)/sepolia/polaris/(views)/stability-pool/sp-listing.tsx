"use client";

// Polaris Stability Pool deposits — client half: the shared listing driver
// with the deposit card's listing render (polaris-deposit-card.tsx). A
// deposit is (market, token id), so the href and key are the pair. A wallet
// search draws the wallet's CDPs and reserve loans under the rows and counts
// them in the strip (rails-ops TO-DO-stability-pool-deposits §1b).

import { useMemo } from "react";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import type { FilterOptionDef } from "@/components/shared/filter-bar/types";
import { RailHeader } from "@/components/shared/rail-header";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import { usePolarisMarkets } from "@/hooks/usePolarisMarkets";
import { polarisHolderStrip } from "@/lib/polaris/holder-strip";
import {
  POLARIS_LOANS,
  polarisCdpKind,
  polarisDepositKey,
  polarisDepositListingCard,
} from "@/lib/polaris/holder-kinds";
import { POLARIS_ITEMS_PER_PAGE } from "@/lib/polaris/list-filter-dimensions";
import { namesHolder } from "@/lib/polaris/search";
import { depositCountLine } from "@/lib/polaris/sp-loan-visibility";
import { readListQuery } from "@/lib/shared/list-filter";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
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
import type { PolarisDepositRow, PolarisLoanRow } from "@/lib/sources/api/polaris-sp-loans";

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
  const { markets, settled } = usePolarisMarkets();
  const otherKinds = useMemo(() => [polarisCdpKind(markets, !settled), POLARIS_LOANS], [markets, settled]);
  const { wallet, reads } = useHolderKinds(otherKinds, readListQuery(useUrlSearchParams(props.initialSearch ?? "")));
  const cdps = reads.cdp;
  const loans = reads[POLARIS_LOANS.id];

  // The strip states the wallet: the search names a holder, no pill narrows
  // the rows, the board has landed (the CDPs' legs are priced at it), and the
  // CDPs' and loans' reads have answered; a failed one leaves its kind unsaid.
  const holderStrip = (items: PolarisDepositRow[], total: number, f: PolarisDepositFilters) => {
    if (!namesHolder(f.q) || f.status.length || f.market.length || f.vault.length || f.tx.length) return null;
    if (!markets || cdps === undefined || loans === undefined) return null;
    const c = cdps === "failed" ? undefined : (cdps as HolderKindPage<PolarisPositionSummary>);
    return (
      <HolderStrip
        {...polarisHolderStrip(
          c?.rows ?? [],
          c?.total ?? 0,
          markets,
          POLARIS_ITEMS_PER_PAGE,
          c?.passedOn ?? 0,
          f.q.trim(),
          {
            deposits: { rows: items, total },
            loans: loans === "failed" ? undefined : (loans as HolderKindPage<PolarisLoanRow>),
          },
        )}
      />
    );
  };

  return (
    <ChainTruthListingPage<PolarisDepositRow, PolarisDepositFilters>
      title="Polaris Stability Pool deposits"
      noun="Deposits"
      basePath={POLARIS_SP_PATH}
      identity={<RailHeader session="polaris" venue="subPage" stamp />}
      titleHidden
      countLine={depositCountLine}
      defaults={DEPOSIT_LIST_DEFAULTS}
      sortOptions={depositSortOptions}
      searchPlaceholder="Address, ENS, or deposit number (usdp:40)"
      renderCard={polarisDepositListingCard}
      hrefFor={(r) => polarisDepositHref(r.market, r.token_id)}
      keyFor={polarisDepositKey}
      strategy={serverStrategy<PolarisDepositRow, PolarisDepositFilters>({
        dimensions: depositListDimensions(marketOptions),
        itemsPerPage: SP_LOAN_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchDepositPage(f, page),
        // A draft's total, one row asked (the editors' "Show N", ui-jobs 805).
        countDraft: (f) => fetchDepositPage(f, 1, { limit: 1 }).then((r) => r.total),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={() => <HolderKinds kinds={otherKinds} reads={reads} wallet={wallet} />}
      {...props}
    />
  );
}
