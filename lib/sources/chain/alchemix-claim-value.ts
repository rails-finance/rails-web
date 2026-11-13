// What a Transmuter claim's payout was worth: the vault's convertToAssets of
// the shares paid out, at the claim's block (rails-ops
// reference/official-docs/alchemix.md, chain read 1, ui-jobs 646). Alchemix's
// docs say a claim pays "1 asset-worth of MYT ... for every 1 alAsset that has
// vested"; this read lets the page state the payout's value beside the share
// count.
//
// STORED FIRST (decisions/0054, ruling 2). The page renders from the indexed
// position, which carries the share count; this read only tops it up. The
// answer at a past block cannot change, so it goes into Next's data cache with
// no revalidation (`unstable_cache`, `revalidate: false`, as
// lib/vaults/asset-scale.ts caches its reads): one eth_call per claim, ever,
// per deployment. A read that fails, runs late or is refused throws inside the
// cached function, so nothing is kept, and answers null here: the pane then
// states the share count alone (lib/alchemix/claim-payout.ts).
//
// ALCHEMIX_CLAIM_VALUE_FAIL=1 forces that null path outside production, for
// checking the fallback on a dev server; production ignores it.
//
// SERVER-ONLY.

import "server-only";
import { unstable_cache } from "next/cache";
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

async function readOnce(
  chainId: ChainId,
  vault: string,
  sharesRaw: string,
  block: number,
): Promise<TransmuterClaimValue> {
  const assets = await Promise.race([
    chainClient(chainId).readContract({
      address: vault as `0x${string}`,
      abi: ABI,
      functionName: "convertToAssets",
      args: [BigInt(sharesRaw)],
      blockNumber: BigInt(block),
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS)),
  ]);
  return { vault, block, sharesRaw, assetsRaw: assets.toString() };
}

const readKept = unstable_cache(readOnce, ["alchemix-claim-value"], { revalidate: false });

export async function readTransmuterClaimValue(
  chainId: ChainId,
  vault: string,
  sharesRaw: string,
  block: number,
): Promise<TransmuterClaimValue | null> {
  if (process.env.NODE_ENV !== "production" && process.env.ALCHEMIX_CLAIM_VALUE_FAIL === "1") return null;
  try {
    return await readKept(chainId, vault.toLowerCase(), sharesRaw, block);
  } catch (err) {
    console.error("alchemix transmuter: the claim's convertToAssets did not land", err);
    return null;
  }
}
