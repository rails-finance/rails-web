// A Liquity V2 (or fork) deposit's index read, done on the server. SERVER-ONLY: imported
// by the deposit page and its event route, which read the same rows within
// one request (`cache()`). A 404 is "missing" (the page's notFound); any other
// failure is null, and the client view reads the rows itself.

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { SP_FIRST_READ } from "./sp-timeline-events";
import { SP_DEPLOYMENTS, type SpDeploymentId } from "./sp-deployment";
import {
  LiquityV2SpHttpError,
  readLiquityV2Sp,
  type LiquityV2DepositTimelineResponse,
} from "@/lib/sources/api/liquity-v2-sp";

/** The deposit's position row and its newest SP_FIRST_READ rows, on the
 *  deployment the id names (lib/liquity-v2/sp-deployment.ts). */
export const loadSpDeposit = cache(
  async (
    depId: SpDeploymentId,
    collateralType: string,
    wallet: string,
  ): Promise<LiquityV2DepositTimelineResponse<string> | "missing" | null> => {
    try {
      const hop = await boxHop();
      if (!hop) return null;
      return await readLiquityV2Sp<LiquityV2DepositTimelineResponse<string>>(
        "stability-pool/timeline",
        { collateralType, wallet, order: "desc", limit: String(SP_FIRST_READ) },
        { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS), api: SP_DEPLOYMENTS[depId].api },
      );
    } catch (err) {
      if (err instanceof LiquityV2SpHttpError && err.status === 404) return "missing";
      console.error(`${depId} deposit page read failed:`, err);
      return null;
    }
  },
);

/** Liquity V2's deposit. */
export const loadLiquityV2Deposit = (
  collateralType: string,
  wallet: string,
): Promise<LiquityV2DepositTimelineResponse | "missing" | null> =>
  loadSpDeposit("liquity-v2", collateralType, wallet) as Promise<LiquityV2DepositTimelineResponse | "missing" | null>;
