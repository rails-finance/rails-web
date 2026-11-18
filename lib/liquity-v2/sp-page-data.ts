// A Liquity V2 deposit's index read, done on the server. SERVER-ONLY: imported
// by the deposit page and its event route, which read the same rows within
// one request (`cache()`). A 404 is "missing" (the page's notFound); any other
// failure is null, and the client view reads the rows itself.

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { SP_FIRST_READ } from "./sp-timeline-events";
import {
  LiquityV2SpHttpError,
  readLiquityV2Sp,
  type LiquityV2DepositTimelineResponse,
} from "@/lib/sources/api/liquity-v2-sp";

/** The deposit's position row and its newest SP_FIRST_READ rows. */
export const loadLiquityV2Deposit = cache(
  async (collateralType: string, wallet: string): Promise<LiquityV2DepositTimelineResponse | "missing" | null> => {
    try {
      const hop = await boxHop();
      if (!hop) return null;
      return await readLiquityV2Sp<LiquityV2DepositTimelineResponse>(
        "stability-pool/timeline",
        { collateralType, wallet, order: "desc", limit: String(SP_FIRST_READ) },
        { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
      );
    } catch (err) {
      if (err instanceof LiquityV2SpHttpError && err.status === 404) return "missing";
      console.error("liquity-v2 deposit page read failed:", err);
      return null;
    }
  },
);
