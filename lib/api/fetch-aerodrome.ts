import "server-only";

// Clients for rails-server's Aerodrome routes on Base (rails-ops ui-jobs 566):
// one Slipstream position at the head and 30 days back, and a wallet's
// positions, staked and unstaked. Raw values; lib/aerodrome/position.ts does
// the math. Cached as the routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { AeroDeployment, AeroPositionRead, AeroPositionsRead } from "@/lib/aerodrome/types";

/** GET /api/at-block/aerodrome/position */
export function fetchAerodromePosition(deployment: AeroDeployment, id: string): Promise<UniAnswer<AeroPositionRead>> {
  const qs = new URLSearchParams({ deployment, id });
  return readAtBlock(`/api/at-block/aerodrome/position?${qs}`, 60, "aerodrome");
}

/** GET /api/at-block/aerodrome/positions */
export function fetchAerodromePositions(owner: string): Promise<UniAnswer<AeroPositionsRead>> {
  const qs = new URLSearchParams({ owner: owner.toLowerCase() });
  return readAtBlock(`/api/at-block/aerodrome/positions?${qs}`, 60, "aerodrome");
}
