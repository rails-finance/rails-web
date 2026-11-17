"use client";

// Polaris reserve loans — client half: the shared listing driver with the
// loan card's listing render (polaris-loan-card.tsx).

import { ChainTruthListingPage, serverStrategy } from "@/components/shared/chain-truth-listing-page";
import { RailHeader } from "@/components/shared/rail-header";
import { PolarisLoanCard } from "@/components/protocol/polaris/polaris-loan-card";
import { polarisLoanHref, POLARIS_LOANS_PATH } from "@/lib/polaris/routes";
import {
  fetchLoanPage,
  LOAN_LIST_DEFAULTS,
  LOAN_SORT_OPTIONS,
  loanListDimensions,
  SP_LOAN_ITEMS_PER_PAGE,
  type PolarisLoanFilters,
} from "@/lib/polaris/sp-loan-listing";
import type { PolarisLoanRow } from "@/lib/sources/api/polaris-sp-loans";

export function LoanListing(props: {
  initialItems?: PolarisLoanRow[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}) {
  return (
    <ChainTruthListingPage<PolarisLoanRow, PolarisLoanFilters>
      title="Polaris reserve loans"
      noun="Loans"
      basePath={POLARIS_LOANS_PATH}
      identity={<RailHeader session="polaris" venue="subPage" stamp />}
      titleHidden
      defaults={LOAN_LIST_DEFAULTS}
      sortOptions={LOAN_SORT_OPTIONS}
      searchPlaceholder="Address, ENS, or loan number"
      renderCard={(r) => <PolarisLoanCard row={r} surface="listing" />}
      hrefFor={(r) => polarisLoanHref(r.loan_id)}
      keyFor={(r) => r.loan_id}
      strategy={serverStrategy<PolarisLoanRow, PolarisLoanFilters>({
        dimensions: loanListDimensions(),
        itemsPerPage: SP_LOAN_ITEMS_PER_PAGE,
        fetchPage: (f, page) => fetchLoanPage(f, page),
      })}
      {...props}
    />
  );
}
