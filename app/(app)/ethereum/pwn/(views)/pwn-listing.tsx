"use client";

// PWN listing — client half. Holds the presentation config + the in-memory strategy
// and hands them to the shared ChainTruthListingPage driver with the SSR first-paint
// data from page.tsx (the full loan set, filtered client-side).

import type { PwnPositionSummary } from "@/lib/sources/api/pwn-positions";
import { fetchAllPwnPositions } from "@/lib/api/fetch-pwn-positions";
import { ChainTruthListingPage, memoryStrategy } from "@/components/shared/chain-truth-listing-page";
import { PwnPositionCard, viewFromSummary } from "@/components/protocol/pwn/pwn-position-card";
import {
  pwnListDimensions,
  PWN_LIST_DEFAULTS,
  PWN_SORT_OPTIONS,
  PWN_APPLY,
  type PwnListFilters,
} from "@/lib/pwn/list-filter-dimensions";

export interface PwnListingProps {
  initialItems?: PwnPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function PwnListing({ initialItems, initialTotal, initialKey, initialSearch }: PwnListingProps) {
  return (
    <ChainTruthListingPage<PwnPositionSummary, PwnListFilters>
      title="PWN Loans"
      noun="loans"
      basePath="/ethereum/pwn"
      bookmarksProtocol="pwn"
      defaults={PWN_LIST_DEFAULTS}
      sortOptions={PWN_SORT_OPTIONS}
      searchPlaceholder="Search loan #, lender, or borrower"
      renderCard={(p) => <PwnPositionCard v={viewFromSummary(p)} />}
      hrefFor={(p) => `/ethereum/pwn/${p.borrower ?? p.lender ?? ""}?loan=${p.loanId}`}
      keyFor={(p) => p.loanId}
      strategy={memoryStrategy<PwnPositionSummary, PwnListFilters>({
        fetchAll: () => fetchAllPwnPositions({ sortOrder: "desc" }),
        dimensions: pwnListDimensions,
        apply: PWN_APPLY,
      })}
      initialItems={initialItems}
      initialTotal={initialTotal}
      initialKey={initialKey}
      initialSearch={initialSearch}
    />
  );
}
