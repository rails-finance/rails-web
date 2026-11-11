import "server-only";

// Clients for rails-server's position-index routes (rails-ops decision 0063):
// an index's coverage (its deployment, start and through blocks) and its
// count of current positions and holders. Keyed by the index's protocol key
// and the chain id. Cached for ten minutes; the index advances with the chain.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";
import type { IndexProgress } from "@/lib/shared/index-progress";

/** GET /api/index/<protocol>/<chain>/coverage */
export interface IndexCoverage {
  protocol: string;
  chain: number;
  deploymentBlock: number;
  startBlock: number;
  throughBlock: number;
  fromDeployment: boolean;
}

/** GET /api/index/<protocol>/<chain>/count */
export interface IndexCount {
  coverage: IndexCoverage;
  /** The block the count is read through. */
  through: number;
  /** Current holdings: one per holder and pool (Balancer V3). */
  positions: number;
  /** Distinct addresses holding at least one position, wallets and contracts both. */
  holders: number;
}

const REVALIDATE = 600;

export function fetchIndexCoverage(protocol: string, chainId: number): Promise<UniAnswer<IndexCoverage>> {
  return readAtBlock(`/api/index/${protocol}/${chainId}/coverage`, REVALIDATE, `index ${protocol}`);
}

export function fetchIndexCount(protocol: string, chainId: number): Promise<UniAnswer<IndexCount>> {
  return readAtBlock(`/api/index/${protocol}/${chainId}/count`, REVALIDATE, `index ${protocol}`);
}

/** GET /api/index/progress: every index's progress, from stored rows only
 *  (the status page, rails-ops ui-jobs 583). The fill writes it every 10 min;
 *  a minute's cache keeps the page within a minute of the last heartbeat. */
export function fetchIndexProgress(): Promise<UniAnswer<IndexProgress>> {
  return readAtBlock("/api/index/progress", 60, "index progress");
}
