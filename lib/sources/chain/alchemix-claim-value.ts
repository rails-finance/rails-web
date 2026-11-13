// What a Transmuter claim's payout was worth: the vault's convertToAssets of
// the shares paid out, at the claim's block (rails-ops
// reference/official-docs/alchemix.md, chain read 1, ui-jobs 646). Alchemix's
// docs say a claim pays "1 asset-worth of MYT ... for every 1 alAsset that has
// vested"; this read is what lets the page state the payout's value beside the
// share count.
//
// One eth_call at a past block, whose answer cannot change, so it is kept in
// process for the life of the server. A read that fails or runs late answers
// null and the page states the share count alone.
//
// SERVER-ONLY.

import { parseAbi } from "viem";
import { chainClient } from "@/lib/sources/chain/rpc";
import type { ChainId } from "@/lib/shared/chains";

const ABI = parseAbi(["function convertToAssets(uint256) view returns (uint256)"]);
const TIMEOUT_MS = 4000;

export interface TransmuterClaimValue {
  vault: string;
  block: number;
  sharesRaw: string;
  assetsRaw: string;
}

const kept = new Map<string, TransmuterClaimValue>();

export async function readTransmuterClaimValue(
  chainId: ChainId,
  vault: string,
  sharesRaw: string,
  block: number,
): Promise<TransmuterClaimValue | null> {
  const key = `${chainId}:${vault.toLowerCase()}:${sharesRaw}:${block}`;
  const hit = kept.get(key);
  if (hit) return hit;
  try {
    const assets = await Promise.race([
      chainClient(chainId).readContract({
        address: vault as `0x${string}`,
        abi: ABI,
        functionName: "convertToAssets",
        args: [BigInt(sharesRaw)],
        blockNumber: BigInt(block),
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (assets == null) return null;
    const value = { vault: vault.toLowerCase(), block, sharesRaw, assetsRaw: assets.toString() };
    kept.set(key, value);
    return value;
  } catch (err) {
    console.error("alchemix transmuter: the claim's convertToAssets did not land", err);
    return null;
  }
}
