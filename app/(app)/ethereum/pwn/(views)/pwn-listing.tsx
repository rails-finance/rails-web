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
import { effectiveStatuses, sameStatusSet, UNSETTLED_PWN_STATUS_BUCKETS } from "@/lib/pwn/listing-visibility";

export interface PwnListingProps {
  initialItems?: PwnPositionSummary[];
  initialTotal?: number;
  initialKey?: string;
  initialSearch?: string;
}

export function PwnListing({ initialItems, initialTotal, initialKey, initialSearch }: PwnListingProps) {
  return (
    <ChainTruthListingPage<PwnPositionSummary, PwnListFilters>
      // The bare directory lists the loans still in escrow, and says so.
      title={(f) =>
        sameStatusSet(effectiveStatuses(f), UNSETTLED_PWN_STATUS_BUCKETS) ? "PWN Loans in Escrow" : "PWN Loans"
      }
      noun="loans"
      basePath="/ethereum/pwn"
      bookmarksProtocol="pwn"
      defaults={PWN_LIST_DEFAULTS}
      sortOptions={PWN_SORT_OPTIONS}
      searchPlaceholder="Search loan #, lender, or borrower"
      renderCard={(p) => <PwnPositionCard v={viewFromSummary(p)} />}
      // The whole book's size beside the filtered view: the memory tier holds
      // every loan, so the SSR set is the denominator.
      renderAbove={({ total, filters }) =>
        initialItems && initialItems.length > 0 ? (
          <p className="mb-2 text-[11px] tabular-nums text-rb-500">
            {total} of {initialItems.length} loans
            {sameStatusSet(effectiveStatuses(filters), UNSETTLED_PWN_STATUS_BUCKETS)
              ? ": the loans in escrow, running or defaulted and not yet claimed"
              : null}
          </p>
        ) : null
      }
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
