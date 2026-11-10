import "server-only";

// Clients for rails-server's Fluid routes on Base (rails-ops ui-jobs 574): one
// vault position at the head and 30 days back, and a wallet's positions. Raw
// values; lib/fluid-base/position.ts does the math. Cached as the routes cache,
// a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { FluidBasePositionRead, FluidBasePositionsRead } from "@/lib/fluid-base/types";

/** GET /api/at-block/fluid-base/position */
export function fetchFluidBasePosition(id: string): Promise<UniAnswer<FluidBasePositionRead>> {
  return readAtBlock(`/api/at-block/fluid-base/position?${new URLSearchParams({ id })}`, 60, "fluid-base");
}

/** GET /api/at-block/fluid-base/positions */
export function fetchFluidBasePositions(owner: string): Promise<UniAnswer<FluidBasePositionsRead>> {
  return readAtBlock(
    `/api/at-block/fluid-base/positions?${new URLSearchParams({ owner: owner.toLowerCase() })}`,
    60,
    "fluid-base",
  );
}
