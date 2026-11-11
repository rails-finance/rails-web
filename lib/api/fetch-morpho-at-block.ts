import "server-only";

// Clients for rails-server's Morpho Blue routes read on visit, one set per
// deployment (rails-ops ui-jobs 577 and 578): /api/at-block/morpho-arc and
// /api/at-block/morpho-optimism. The markets, one market, a wallet's positions
// and one position at the head and 30 days back. Raw values; lib/morpho-at-block
// does the math. Cached as the routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type {
  MorphoAtBlockDeployment,
  MorphoAtBlockMarketRead,
  MorphoAtBlockMarketsRead,
  MorphoAtBlockPositionRead,
  MorphoAtBlockWalletRead,
} from "@/lib/morpho-at-block/types";

type Dep = Pick<MorphoAtBlockDeployment, "api">;

/** GET /api/at-block/<api>/markets */
export function fetchMorphoAtBlockMarkets(dep: Dep): Promise<UniAnswer<MorphoAtBlockMarketsRead>> {
  return readAtBlock(`/api/at-block/${dep.api}/markets`, 60, dep.api);
}

/** GET /api/at-block/<api>/market */
export function fetchMorphoAtBlockMarket(dep: Dep, id: string): Promise<UniAnswer<MorphoAtBlockMarketRead>> {
  return readAtBlock(`/api/at-block/${dep.api}/market?${new URLSearchParams({ id: id.toLowerCase() })}`, 60, dep.api);
}

/** GET /api/at-block/<api>/wallet */
export function fetchMorphoAtBlockWallet(dep: Dep, owner: string): Promise<UniAnswer<MorphoAtBlockWalletRead>> {
  return readAtBlock(
    `/api/at-block/${dep.api}/wallet?${new URLSearchParams({ owner: owner.toLowerCase() })}`,
    60,
    dep.api,
  );
}

/** GET /api/at-block/<api>/position */
export function fetchMorphoAtBlockPosition(
  dep: Dep,
  id: string,
  wallet: string,
): Promise<UniAnswer<MorphoAtBlockPositionRead>> {
  return readAtBlock(
    `/api/at-block/${dep.api}/position?${new URLSearchParams({ id: id.toLowerCase(), wallet: wallet.toLowerCase() })}`,
    60,
    dep.api,
  );
}
