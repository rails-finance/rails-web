// The Stability Pool's depth per branch (ui-jobs 748). SERVER-ONLY: imported
// by /api/chain/liquity-v2/sp-depth and the server halves of the branches and
// Stability Pool roster pages.
//
// One block and one multicall at it: each branch pool's getTotalBoldDeposits()
// and each TroveManager's getEntireBranchDebt() (lib/liquity-v2/sp-depth.ts).
// A failed read returns null; a failed call leaves its raw null.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { LIQUITY_V2_SP_POOLS } from "@/lib/liquity-v2/sp-catalog";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";
import type { SpDepth, SpDepthBranch } from "@/lib/liquity-v2/sp-depth";

const SP_ABI = parseAbi(["function getTotalBoldDeposits() view returns (uint256)"]);
const TM_ABI = parseAbi(["function getEntireBranchDebt() view returns (uint256)"]);

const BRANCHES = Object.keys(LIQUITY_V2_SP_POOLS) as SpBranch[];

/** The three pools and branch debts at `atBlock`, or at head. */
export async function loadLiquityV2SpDepth(atBlock?: number): Promise<SpDepth | null> {
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    const block = await client.getBlock(atBlock != null && atBlock > 0 ? { blockNumber: BigInt(atBlock) } : {});
    const rows = BRANCHES.map((symbol) => ({
      symbol,
      pool: LIQUITY_V2_SP_POOLS[symbol],
      troveManager: LIQUITY_V2_BRANCHES[symbol.toLowerCase()].troveManager,
    }));
    const res = await client.multicall({
      allowFailure: true,
      blockNumber: block.number,
      contracts: rows.flatMap((r) => [
        { address: getAddress(r.pool), abi: SP_ABI, functionName: "getTotalBoldDeposits" } as const,
        { address: getAddress(r.troveManager), abi: TM_ABI, functionName: "getEntireBranchDebt" } as const,
      ]),
    });
    const raw = (i: number) => (res[i].status === "success" ? String(res[i].result) : null);
    const branches: SpDepthBranch[] = rows.map((r, i) => ({ ...r, depositsRaw: raw(2 * i), debtRaw: raw(2 * i + 1) }));
    if (branches.every((b) => b.depositsRaw == null && b.debtRaw == null)) return null;
    return { blockNumber: Number(block.number), blockTimestamp: Number(block.timestamp), branches };
  } catch (err) {
    console.error("Liquity V2 Stability Pool depth read failed:", err);
    return null;
  }
}
