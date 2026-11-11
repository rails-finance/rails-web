import "server-only";

// Clients for rails-server's position-index routes (rails-ops decision 0063):
// an index's coverage (its deployment, start and through blocks). Keyed by the
// index's protocol key and the chain id. Cached for ten minutes; the index
// advances with the chain.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { readAtBlock, type UniAnswer } from "@/lib/api/fetch-uniswap";

/** GET /api/index/<protocol>/<chain>/coverage */
export interface IndexCoverage {
  protocol: string;
  chain: number;
  deploymentBlock: number;
  startBlock: number;
  throughBlock: number;
  fromDeployment: boolean;
}

const REVALIDATE = 600;

export function fetchIndexCoverage(protocol: string, chainId: number): Promise<UniAnswer<IndexCoverage>> {
  return readAtBlock(`/api/index/${protocol}/${chainId}/coverage`, REVALIDATE, `index ${protocol}`);
}
