// A Liquity V1 stake's index read, done on the server. SERVER-ONLY: imported
// by the stake page and its event route, which read the same rows within one
// request (`cache()`). A 404 is "missing" (the page's notFound); any other
// failure is null, and the client view reads the rows itself.

import { cache } from "react";
import { boxHop, SSR_FETCH_TIMEOUT_MS } from "@/lib/shared/listing-ssr";
import { ST_FIRST_READ } from "./staking-timeline-events";
import {
  LiquityV1StakingHttpError,
  readLiquityV1Staking,
  type LiquityV1StakeTimelineResponse,
} from "@/lib/sources/api/liquity-v1-staking";

/** The stake's position row and its newest ST_FIRST_READ rows. */
export const loadLiquityV1Stake = cache(
  async (wallet: string): Promise<LiquityV1StakeTimelineResponse | "missing" | null> => {
    try {
      const hop = await boxHop();
      if (!hop) return null;
      return await readLiquityV1Staking<LiquityV1StakeTimelineResponse>(
        "staking/timeline",
        { wallet, order: "desc", limit: String(ST_FIRST_READ) },
        { ...hop, signal: AbortSignal.timeout(SSR_FETCH_TIMEOUT_MS) },
      );
    } catch (err) {
      if (err instanceof LiquityV1StakingHttpError && err.status === 404) return "missing";
      console.error("liquity-v1 stake page read failed:", err);
      return null;
    }
  },
);
