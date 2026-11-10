import "server-only";

// Clients for rails-server's Balancer V3 routes (rails-ops ui-jobs 569): a
// wallet's share of one pool at the head and 30 days back, and the pools a
// wallet holds a share of. Raw values; lib/balancer/position.ts does the math.
// Cached as the routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { BalPositionRead, BalPositionsRead } from "@/lib/balancer/types";

/** GET /api/at-block/balancer/position */
export function fetchBalancerPosition(
  chainId: number,
  pool: string,
  wallet: string,
): Promise<UniAnswer<BalPositionRead>> {
  const qs = new URLSearchParams({ chainId: String(chainId), pool: pool.toLowerCase(), wallet: wallet.toLowerCase() });
  return readAtBlock(`/api/at-block/balancer/position?${qs}`, 60, "balancer");
}

/** GET /api/at-block/balancer/positions */
export function fetchBalancerPositions(chainId: number, owner: string): Promise<UniAnswer<BalPositionsRead>> {
  const qs = new URLSearchParams({ chainId: String(chainId), owner: owner.toLowerCase() });
  return readAtBlock(`/api/at-block/balancer/positions?${qs}`, 60, "balancer");
}
