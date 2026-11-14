import "server-only";

// Clients for rails-server's Aave V4 routes on Arc (rails-ops ui-jobs 577): a
// wallet's spokes, and one spoke account at the head and 30 days back. Raw
// values; lib/aave-v4-arc/position.ts does the math. Cached as the routes
// cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { ArcPositionRead, ArcWalletRead } from "@/lib/aave-v4-arc/types";

/** GET /api/at-block/aave-v4-arc/wallet */
export function fetchAaveV4ArcWallet(owner: string): Promise<UniAnswer<ArcWalletRead>> {
  return readAtBlock(
    `/api/at-block/aave-v4-arc/wallet?${new URLSearchParams({ owner: owner.toLowerCase() })}`,
    60,
    "aave-v4-arc",
  );
}

/** GET /api/at-block/aave-v4-arc/position */
export function fetchAaveV4ArcPosition(spoke: string, wallet: string): Promise<UniAnswer<ArcPositionRead>> {
  return readAtBlock(
    `/api/at-block/aave-v4-arc/position?${new URLSearchParams({ spoke, wallet: wallet.toLowerCase() })}`,
    60,
    "aave-v4-arc",
  );
}
