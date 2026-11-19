// A Liquity V2 redeemer's index read, done on the server. SERVER-ONLY:
// imported by the redeemer page. Any failure is null, and the client view
// reads the rows itself.

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { readLiquityV2Redeemer, type LiquityV2RedeemerResponse } from "@/lib/sources/api/liquity-v2-redeemer";
import { REDEEMER_FIRST_READ } from "./redeemer-timeline";

/** The wallet's totals and its newest REDEEMER_FIRST_READ rows. */
export const loadLiquityV2Redeemer = cache(async (address: string): Promise<LiquityV2RedeemerResponse | null> => {
  try {
    const hop = await boxHop();
    if (!hop) return null;
    return await readLiquityV2Redeemer(
      address,
      { order: "desc", limit: String(REDEEMER_FIRST_READ) },
      { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
    );
  } catch (err) {
    console.error("liquity-v2 redeemer page read failed:", err);
    return null;
  }
});
