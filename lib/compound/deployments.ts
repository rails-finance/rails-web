// The Comet deployments by name: which roster a `?deployment=` parameter, an
// event page or a chain id means. Ethereum is the default wherever a name is
// absent or unknown, as it was before Base had a roster. Client-safe.

import { ARBITRUM_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { COMPOUND_DEPLOYMENT, type CometDeployment } from "./asset-catalog";
import { COMPOUND_BASE_DEPLOYMENT } from "@/lib/compound-base/asset-catalog";
import { COMPOUND_ARBITRUM_DEPLOYMENT } from "@/lib/compound-arbitrum/asset-catalog";

export type CompoundDeploymentKey = "ethereum" | "base" | "arbitrum";

const BY_KEY: Record<CompoundDeploymentKey, CometDeployment> = {
  ethereum: COMPOUND_DEPLOYMENT,
  base: COMPOUND_BASE_DEPLOYMENT,
  arbitrum: COMPOUND_ARBITRUM_DEPLOYMENT,
};

export const COMPOUND_DEPLOYMENT_CHAIN: Record<CompoundDeploymentKey, ChainId> = {
  ethereum: MAINNET_CHAIN_ID,
  base: BASE_CHAIN_ID,
  arbitrum: ARBITRUM_CHAIN_ID,
};

export function cometDeploymentOf(key: CompoundDeploymentKey): CometDeployment {
  return BY_KEY[key];
}

/** A `?deployment=` value as a deployment name; anything else is Ethereum. */
export function compoundDeploymentParam(raw: string | null | undefined): CompoundDeploymentKey {
  return raw === "base" || raw === "arbitrum" ? raw : "ethereum";
}

/** The deployment on a chain; Ethereum for any chain without a Comet roster. */
export function compoundDeploymentOfChain(chainId: number | undefined): CompoundDeploymentKey {
  return chainId === BASE_CHAIN_ID ? "base" : chainId === ARBITRUM_CHAIN_ID ? "arbitrum" : "ethereum";
}
