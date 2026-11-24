"use client";

// Polaris reserve loans — client half: the shared listing driver with the
// loan card's listing render (polaris-loan-card.tsx). A wallet search draws
// the wallet's CDPs and Stability Pool deposits under the rows and counts them
// in the strip (rails-ops TO-DO-stability-pool-deposits §1b).

import { useMemo } from "react";
import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { HolderStrip } from "@/components/shared/holder-strip";
import { HolderKinds, useHolderKinds, type HolderKindPage } from "@/components/shared/holder-kinds";
import { usePolarisMarkets } from "@/hooks/usePolarisMarkets";
import { polarisHolderStrip } from "@/lib/polaris/holder-strip";
import { POLARIS_DEPOSITS, polarisCdpKind, polarisLoanListingCard } from "@/lib/polaris/holder-kinds";
import { POLARIS_ITEMS_PER_PAGE } from "@/lib/polaris/list-filter-dimensions";
import { namesHolder } from "@/lib/polaris/search";
import { loanCountLine } from "@/lib/polaris/sp-loan-visibility";
import { readListQuery } from "@/lib/shared/list-filter";
import { useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";
import { polarisLoanHref, POLARIS_LOANS_PATH } from "@/lib/polaris/routes";
import {
  fetchLoanPage,
  LOAN_LIST_DEFAULTS,
  LOAN_SORT_OPTIONS,
  loanListDimensions,
  SP_LOAN_ITEMS_PER_PAGE,
  type PolarisLoanFilters,
} from "@/lib/polaris/sp-loan-listing";
import type { PolarisDepositRow, PolarisLoanRow } from "@/lib/sources/api/polaris-sp-loans";

export function LoanListing(props: {
  initialItems?: PolarisLoanRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  const { markets, settled } = usePolarisMarkets();
  const otherKinds = useMemo(() => [polarisCdpKind(markets, !settled), POLARIS_DEPOSITS], [markets, settled]);
  const { wallet, reads } = useHolderKinds(otherKinds, readListQuery(useUrlSearchParams(props.initialSearch ?? "")));
  const cdps = reads.cdp;
  const deposits = reads[POLARIS_DEPOSITS.id];

  // The strip states the wallet: the search names a holder, no pill narrows
  // the rows, the board has landed (the CDPs' legs are priced at it), and the
  // CDPs' and deposits' reads have answered; a failed one leaves its kind unsaid.
  const holderStrip = (items: PolarisLoanRow[], total: number, f: PolarisLoanFilters) => {
    if (!namesHolder(f.q) || f.status.length || f.tx.length) return null;
    if (!markets || cdps === undefined || deposits === undefined) return null;
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
            deposits: deposits === "failed" ? undefined : (deposits as HolderKindPage<PolarisDepositRow>),
            loans: { rows: items, total },
          },
        )}
      />
    );
  };

  return (
    <ChainTruthListingPage<PolarisLoanRow, PolarisLoanFilters>
      title="Polaris reserve loans"
      noun="Loans"
      basePath={POLARIS_LOANS_PATH}
      identity={<RailHeader session="polaris" venue="subPage" stamp />}
      titleHidden
      countLine={loanCountLine}
      defaults={LOAN_LIST_DEFAULTS}
      sortOptions={LOAN_SORT_OPTIONS}
      searchPlaceholder="Address, ENS, or loan number"
      renderCard={polarisLoanListingCard}
      hrefFor={(r) => polarisLoanHref(r.loan_id)}
      keyFor={(r) => r.loan_id}
      strategy={serverStrategy<PolarisLoanRow, PolarisLoanFilters>({
        dimensions: loanListDimensions(),
        itemsPerPage: SP_LOAN_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchLoanPage(f, page),
        // A draft's total, one row asked (the editors' "Show N", ui-jobs 805).
        countDraft: (f) => fetchLoanPage(f, 1, { limit: 1 }).then((r) => r.total),
      })}
      renderAbove={({ items, total, filters }) => holderStrip(items, total, filters)}
      renderBelow={() => <HolderKinds kinds={otherKinds} reads={reads} wallet={wallet} />}
      {...props}
    />
  );
}
