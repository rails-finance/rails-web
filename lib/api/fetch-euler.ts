import "server-only";

// Clients for rails-server's Euler V2 routes on Base and Arbitrum: a wallet's
// accounts, and one account's holding in one vault at the head and 30 days
// back. Raw values; lib/euler/position.ts does the math. Cached as the routes
// cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { EulerChainId, EulerPositionRead, EulerWalletRead } from "@/lib/euler/types";

/** GET /api/at-block/euler/positions */
export function fetchEulerWallet(chain: EulerChainId, owner: string): Promise<UniAnswer<EulerWalletRead>> {
  const qs = new URLSearchParams({ chain: String(chain), owner: owner.toLowerCase() });
  return readAtBlock(`/api/at-block/euler/positions?${qs}`, 60, "euler");
}

/** GET /api/at-block/euler/position */
export function fetchEulerPosition(
  chain: EulerChainId,
  account: string,
  vault: string,
): Promise<UniAnswer<EulerPositionRead>> {
  const qs = new URLSearchParams({ chain: String(chain), account: account.toLowerCase(), vault: vault.toLowerCase() });
  return readAtBlock(`/api/at-block/euler/position?${qs}`, 60, "euler");
}
