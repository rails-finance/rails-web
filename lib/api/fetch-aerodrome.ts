import "server-only";

// Clients for rails-server's Slipstream routes (rails-ops ui-jobs 566, 578):
// one position at the head and 30 days back, and a wallet's positions, staked
// and unstaked, on a site (lib/aerodrome/sites.ts): Aerodrome on Base at
// /api/at-block/aerodrome, Velodrome on Optimism at /api/at-block/velodrome
// with chain=10. Raw values; lib/aerodrome/position.ts does the math. Cached
// as the routes cache, a minute.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import { AERODROME, type SlipstreamSite } from "@/lib/aerodrome/sites";
import type { AeroPositionRead, AeroPositionsRead, SlipstreamDeployment } from "@/lib/aerodrome/types";

/** The query: Base's route takes no chain (its default); every other site names its chain. */
const query = (site: SlipstreamSite, q: Record<string, string>) =>
  new URLSearchParams(site.chainId === 8453 ? q : { chain: String(site.chainId), ...q });

/** GET /api/at-block/<site>/position */
export function fetchAerodromePosition(
  deployment: SlipstreamDeployment,
  id: string,
  site: SlipstreamSite = AERODROME,
): Promise<UniAnswer<AeroPositionRead>> {
  return readAtBlock(`/api/at-block/${site.id}/position?${query(site, { deployment, id })}`, 60, site.id);
}

/** GET /api/at-block/<site>/positions */
export function fetchAerodromePositions(
  owner: string,
  site: SlipstreamSite = AERODROME,
): Promise<UniAnswer<AeroPositionsRead>> {
  return readAtBlock(`/api/at-block/${site.id}/positions?${query(site, { owner: owner.toLowerCase() })}`, 60, site.id);
}
