"use client";

import { useState, useEffect } from "react";

interface DebtInFrontResult {
  debtInFront: number | null;
  trovesAhead: number | null;
  /** The branch's entire debt (the whole redemption queue) — the redemption
   *  runway's denominator. Null until the backend ships it / on read failure. */
  queueDebtTotal: number | null;
  loading: boolean;
}

/**
 * Liquity V2 redemption buffer for a trove: the total accrued-inclusive BOLD
 * debt sitting at interest rates at or below this trove's, within its own
 * collateral branch, excluding the trove itself. Redemptions are per-branch
 * queues consumed from the lowest rate up, so this is how much must be redeemed
 * against the branch before this trove is reached.
 *
 * Computed on-chain server-side (MultiTroveGetter walk over live `entireDebt`),
 * so it reflects current accrued interest and exact sorted order — no indexer
 * lag and no client-side pagination race. See rails-server-onboarding
 * `/api/liquity-v2/debt-in-front`.
 *
 * `interestRate` is no longer used in the calculation (the backend reads the
 * trove's live rate directly); it is retained only as a readiness gate — the
 * detail page passes it solely for open troves.
 */
export function useDebtInFront(
  collateralType: string | undefined,
  interestRate: number | undefined,
  troveId: string | undefined,
): DebtInFrontResult {
  const [debtInFront, setDebtInFront] = useState<number | null>(null);
  const [trovesAhead, setTrovesAhead] = useState<number | null>(null);
  const [queueDebtTotal, setQueueDebtTotal] = useState<number | null>(null);
  // A read that has not happened yet is not a read that failed. `settled` turns
  // true only once the fetch resolves one way or the other, so a caller shows a
  // pending shimmer instead of asserting "unavailable" — which is what the trove
  // page's server render would otherwise state, the effect never having run
  // there, and what the first client frame stated before it did.
  const [settled, setSettled] = useState(false);
  const willFetch = Boolean(collateralType && interestRate !== undefined && troveId);

  useEffect(() => {
    if (!collateralType || interestRate === undefined || !troveId) return;

    let cancelled = false;

    const fetchDebtInFront = async () => {
      setSettled(false);

      try {
        const params = new URLSearchParams({ collateralType, troveId });
        const response = await fetch(`/api/liquity-v2/debt-in-front?${params}`);
        if (!response.ok) return;

        const json = await response.json();
        if (cancelled) return;

        const data = json?.data;
        if (data && typeof data.debtInFront === "number") {
          setDebtInFront(data.debtInFront);
          setTrovesAhead(typeof data.trovesAhead === "number" ? data.trovesAhead : null);
          setQueueDebtTotal(typeof data.queueDebtTotal === "number" ? data.queueDebtTotal : null);
        }
      } catch (err) {
        console.error("Error fetching debt in front:", err);
      } finally {
        if (!cancelled) setSettled(true);
      }
    };

    fetchDebtInFront();

    return () => {
      cancelled = true;
    };
  }, [collateralType, interestRate, troveId]);

  return { debtInFront, trovesAhead, queueDebtTotal, loading: willFetch && !settled };
}
