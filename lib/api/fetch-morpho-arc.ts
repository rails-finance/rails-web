import "server-only";

// Clients for rails-server's Morpho Blue routes on Arc (rails-ops ui-jobs 577):
// the markets, one market, a wallet's positions and one position at the head
// and 30 days back. Raw values; lib/morpho-arc does the math. Cached as the
// routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type {
  ArcMorphoMarketRead,
  ArcMorphoMarketsRead,
  ArcMorphoPositionRead,
  ArcMorphoWalletRead,
} from "@/lib/morpho-arc/types";

const WHO = "morpho-arc";

/** GET /api/at-block/morpho-arc/markets */
export function fetchMorphoArcMarkets(): Promise<UniAnswer<ArcMorphoMarketsRead>> {
  return readAtBlock("/api/at-block/morpho-arc/markets", 60, WHO);
}

/** GET /api/at-block/morpho-arc/market */
export function fetchMorphoArcMarket(id: string): Promise<UniAnswer<ArcMorphoMarketRead>> {
  return readAtBlock(`/api/at-block/morpho-arc/market?${new URLSearchParams({ id: id.toLowerCase() })}`, 60, WHO);
}

/** GET /api/at-block/morpho-arc/wallet */
export function fetchMorphoArcWallet(owner: string): Promise<UniAnswer<ArcMorphoWalletRead>> {
  return readAtBlock(`/api/at-block/morpho-arc/wallet?${new URLSearchParams({ owner: owner.toLowerCase() })}`, 60, WHO);
}

/** GET /api/at-block/morpho-arc/position */
export function fetchMorphoArcPosition(id: string, wallet: string): Promise<UniAnswer<ArcMorphoPositionRead>> {
  return readAtBlock(
    `/api/at-block/morpho-arc/position?${new URLSearchParams({ id: id.toLowerCase(), wallet: wallet.toLowerCase() })}`,
    60,
    WHO,
  );
}
