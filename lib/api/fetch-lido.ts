import "server-only";

// Clients for rails-server's Lido routes (rails-ops ui-jobs 570): a wallet's
// stake in stETH and wstETH with its withdrawal requests, and the protocol's
// totals, at the head and 30 days back. Raw values; lib/lido/stake.ts does the
// math. Cached as the routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { LidoProtocolRead, LidoStakeRead } from "@/lib/lido/types";

/** GET /api/at-block/lido/stake */
export function fetchLidoStake(owner: string): Promise<UniAnswer<LidoStakeRead>> {
  const qs = new URLSearchParams({ owner: owner.toLowerCase() });
  return readAtBlock(`/api/at-block/lido/stake?${qs}`, 60, "lido");
}

/** GET /api/at-block/lido/protocol */
export function fetchLidoProtocol(): Promise<UniAnswer<LidoProtocolRead>> {
  return readAtBlock("/api/at-block/lido/protocol", 60, "lido");
}
