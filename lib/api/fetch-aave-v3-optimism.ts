import "server-only";

// The client for rails-server's Aave V3 route on Optimism (rails-ops ui-jobs 578):
// one wallet's account at the head and 30 days back. Raw values;
// lib/aave-v3-optimism/position.ts does the math. Cached as the route caches, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { OpPositionRead } from "@/lib/aave-v3-optimism/types";

/** GET /api/at-block/aave-v3-optimism/position */
export function fetchAaveV3OptimismPosition(wallet: string): Promise<UniAnswer<OpPositionRead>> {
  return readAtBlock(
    `/api/at-block/aave-v3-optimism/position?${new URLSearchParams({ wallet: wallet.toLowerCase() })}`,
    60,
    "aave-v3-optimism",
  );
}
