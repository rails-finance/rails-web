// Which holder addresses are IPOR Fusion vaults, keyed by chain and address,
// from the census in ./vault-catalog (rails-ops TO-DO-ipor-scoping.md §6.2).
// Server side only: the catalog is too large for a client bundle, so the
// holder label asks /api/ipor-fusion/vaults, which answers from here.
//
// A match holds on the chain the census read it on and nowhere else.

import type { ChainId } from "../shared/chains";
import { IPOR_FUSION_CENSUS } from "./vault-catalog";

/** What the holder label states about one vault: its name and symbol as the
 *  chain answered them at the census block. */
export interface IporFusionVaultHit {
  name: string | null;
  symbol: string | null;
  censusBlock: number;
  censusBlockIso: string;
}

const CENSUS_CHAINS: [ChainId, keyof typeof IPOR_FUSION_CENSUS][] = [
  [1, "ethereum"],
  [42161, "arbitrum"],
  [8453, "base"],
];

let index: Map<ChainId, Map<string, IporFusionVaultHit>> | null = null;

function byChain(): Map<ChainId, Map<string, IporFusionVaultHit>> {
  if (index) return index;
  index = new Map();
  for (const [chainId, key] of CENSUS_CHAINS) {
    const census = IPOR_FUSION_CENSUS[key];
    const rows = new Map<string, IporFusionVaultHit>();
    for (const v of census.vaults)
      rows.set(v.address.toLowerCase(), {
        name: v.name,
        symbol: v.symbol,
        censusBlock: census.censusBlock,
        censusBlockIso: census.censusBlockIso,
      });
    index.set(chainId, rows);
  }
  return index;
}

/** The census row for `address` on `chainId`, or null. */
export function iporFusionVaultAt(chainId: number, address: string): IporFusionVaultHit | null {
  return (
    byChain()
      .get(chainId as ChainId)
      ?.get(address.toLowerCase()) ?? null
  );
}

/** The hits among `addresses` on `chainId`, keyed by lowercased address;
 *  a miss is absent. */
export function iporFusionVaultHits(chainId: number, addresses: readonly string[]): Record<string, IporFusionVaultHit> {
  const hits: Record<string, IporFusionVaultHit> = {};
  for (const a of addresses) {
    const hit = iporFusionVaultAt(chainId, a);
    if (hit) hits[a.toLowerCase()] = hit;
  }
  return hits;
}
