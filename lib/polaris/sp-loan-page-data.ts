// A Polaris stability-pool deposit's and a reserve loan's index reads, done
// on the server. SERVER-ONLY: imported by the two position pages and their
// event routes, which read the same rows within one request (`cache()`). A
// 404 is "missing" (the page's notFound); any other failure is null, and the
// client view reads the rows itself.

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { DEPOSIT_FIRST_READ } from "@/lib/polaris/sp-loan-timeline-events";
import {
  PolarisSpLoanHttpError,
  readPolarisSpLoans,
  type PolarisDepositTimelineResponse,
  type PolarisLoanTimelineResponse,
} from "@/lib/sources/api/polaris-sp-loans";

/** The deposit's position row and its newest DEPOSIT_FIRST_READ rows. */
export const loadPolarisDeposit = cache(
  async (market: string, id: string): Promise<PolarisDepositTimelineResponse | "missing" | null> => {
    try {
      const hop = await boxHop();
      if (!hop) return null;
      return await readPolarisSpLoans<PolarisDepositTimelineResponse>(
        "stability-pool/timeline",
        { market, id, order: "desc", limit: String(DEPOSIT_FIRST_READ) },
        { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
      );
    } catch (err) {
      if (err instanceof PolarisSpLoanHttpError && err.status === 404) return "missing";
      console.error("polaris deposit page read failed:", err);
      return null;
    }
  },
);

/** The loan's position row and its whole timeline (a loan has a handful of
 *  touches). */
export const loadPolarisLoan = cache(async (id: string): Promise<PolarisLoanTimelineResponse | "missing" | null> => {
  try {
    const hop = await boxHop();
    if (!hop) return null;
    return await readPolarisSpLoans<PolarisLoanTimelineResponse>(
      "reserve-loans/timeline",
      { id, limit: "5000" },
      { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
    );
  } catch (err) {
    if (err instanceof PolarisSpLoanHttpError && err.status === 404) return "missing";
    console.error("polaris loan page read failed:", err);
    return null;
  }
});
