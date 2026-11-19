// The chains the IPOR Fusion census covers, by chain id and the census's key
// (./vault-catalog). Apart from the catalog so the client holder label can
// skip every other chain without bundling it.

import type { ChainId } from "../shared/chains";

export const IPOR_FUSION_CENSUS_CHAINS = [
  [1, "ethereum"],
  [42161, "arbitrum"],
  [8453, "base"],
] as const satisfies readonly (readonly [ChainId, string])[];

/** The census chain ids; a holder on any other chain is never looked up. */
export const IPOR_FUSION_CHAIN_IDS: ReadonlySet<number> = new Set(IPOR_FUSION_CENSUS_CHAINS.map(([id]) => id));
