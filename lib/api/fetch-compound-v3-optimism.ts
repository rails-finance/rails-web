import "server-only";

// The client for rails-server's Compound V3 routes on Optimism (rails-ops ui-jobs 578): every
// Comet, a wallet's accounts, and one Comet's account at the head and 30 days back. Raw values;
// lib/compound-v3-optimism/position.ts does the math. Cached as the routes cache.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { OpcPositionRead, OpcWalletRead } from "@/lib/compound-v3-optimism/types";
import type { CompoundV3MarketsResponse } from "@/lib/sources/chain/compound-markets";

const WHO = "compound-v3-optimism";

/** GET /api/at-block/compound-v3-optimism/wallet */
export function fetchCompoundV3OptimismWallet(wallet: string): Promise<UniAnswer<OpcWalletRead>> {
  return readAtBlock(`/api/at-block/${WHO}/wallet?${new URLSearchParams({ wallet: wallet.toLowerCase() })}`, 60, WHO);
}

/** GET /api/at-block/compound-v3-optimism/position */
export function fetchCompoundV3OptimismPosition(wallet: string, comet: string): Promise<UniAnswer<OpcPositionRead>> {
  return readAtBlock(
    `/api/at-block/${WHO}/position?${new URLSearchParams({ wallet: wallet.toLowerCase(), comet })}`,
    60,
    WHO,
  );
}

const STALE: CompoundV3MarketsResponse = {
  blockNumber: 0,
  markets: [],
  summary: {
    total: 0,
    suppliedUsd: null,
    borrowedUsd: null,
    utilisationUsd: null,
    suppliedEth: null,
    borrowedEth: null,
    collateralAssets: 0,
  },
  chainStale: true,
};

/** GET /api/at-block/compound-v3-optimism/markets, in the markets reader's shape; a stale stub where it failed,
 *  marked `readCeiling` where the daily read ceiling refused it. */
export async function fetchCompoundV3OptimismMarkets(): Promise<CompoundV3MarketsResponse> {
  const a = await readAtBlock<CompoundV3MarketsResponse>(`/api/at-block/${WHO}/markets`, 30, WHO);
  return a.kind === "ok" ? a.data : a.kind === "ceiling" ? { ...STALE, readCeiling: true } : STALE;
}
