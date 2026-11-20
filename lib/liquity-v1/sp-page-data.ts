// A Liquity V1 deposit's index read, done on the server. SERVER-ONLY: imported
// by the deposit page and its event route, which read the same rows within
// one request (`cache()`). A 404 is "missing" (the page's notFound); any other
// failure is null, and the client view reads the rows itself.

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { SP_FIRST_READ } from "./sp-timeline-events";
import {
  LiquityV1SpHttpError,
  readLiquityV1Sp,
  type LiquityV1DepositTimelineResponse,
} from "@/lib/sources/api/liquity-v1-sp";

/** The deposit's position row and its newest SP_FIRST_READ rows. */
export const loadLiquityV1Deposit = cache(
  async (wallet: string): Promise<LiquityV1DepositTimelineResponse | "missing" | null> => {
    try {
      const hop = await boxHop();
      if (!hop) return null;
      return await readLiquityV1Sp<LiquityV1DepositTimelineResponse>(
        "stability-pool/timeline",
        { wallet, order: "desc", limit: String(SP_FIRST_READ) },
        { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
      );
    } catch (err) {
      if (err instanceof LiquityV1SpHttpError && err.status === 404) return "missing";
      console.error("liquity-v1 deposit page read failed:", err);
      return null;
    }
  },
);
