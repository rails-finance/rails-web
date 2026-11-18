// The Stability Pool's depth per branch (ui-jobs 748). SERVER-ONLY: imported
// by /api/chain/liquity-v2/sp-depth and the server halves of the branches and
// Stability Pool roster pages.
//
// One block and one multicall at it: each branch pool's getTotalBoldDeposits()
// and each TroveManager's getEntireBranchDebt() (lib/liquity-v2/sp-depth.ts).
// A page view costs one getBlock and one multicall (six calls) at most: the
// head read is kept 20 s in-process and a read at a named block for the life
// of the process, so a burst of views shares one read. A block before Liquity
// V2's deployment answers BEFORE_DEPLOY and one past the head PAST_HEAD,
// without a read. A failed read returns null and is not kept; a failed call
// leaves its raw null.

import { BlockNotFoundError, getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { LIQUITY_V2_SP_POOLS } from "@/lib/liquity-v2/sp-catalog";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";
import { LIQUITY_V2_SP_FROM_BLOCK, type SpDepth, type SpDepthBranch } from "@/lib/liquity-v2/sp-depth";

const SP_ABI = parseAbi(["function getTotalBoldDeposits() view returns (uint256)"]);
const TM_ABI = parseAbi(["function getEntireBranchDebt() view returns (uint256)"]);

const BRANCHES = Object.keys(LIQUITY_V2_SP_POOLS) as SpBranch[];

export const BEFORE_DEPLOY = "before-deploy" as const;
export const PAST_HEAD = "past-head" as const;
type Outcome = SpDepth | typeof BEFORE_DEPLOY | typeof PAST_HEAD | null;

const HEAD_TTL_MS = 20_000;
const AT_BLOCK_MAX = 256;
let head: { at: number; read: Promise<Outcome> } | null = null;
const atBlock = new Map<number, SpDepth>();

async function readAt(blockNumber?: number): Promise<Outcome> {
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    let block;
    try {
      block = await client.getBlock(blockNumber != null ? { blockNumber: BigInt(blockNumber) } : {});
    } catch (err) {
      if (blockNumber != null && err instanceof BlockNotFoundError) return PAST_HEAD;
      throw err;
    }
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

/** The three pools and branch debts at `blockNumber`, or at head (kept 20 s). */
export async function loadLiquityV2SpDepthAt(blockNumber?: number): Promise<Outcome> {
  if (blockNumber != null) {
    if (blockNumber < LIQUITY_V2_SP_FROM_BLOCK) return BEFORE_DEPLOY;
    const kept = atBlock.get(blockNumber);
    if (kept) return kept;
    const read = await readAt(blockNumber);
    if (read != null && typeof read === "object") {
      if (atBlock.size >= AT_BLOCK_MAX) atBlock.delete(atBlock.keys().next().value as number);
      atBlock.set(blockNumber, read);
    }
    return read;
  }
  const now = Date.now();
  if (head && now - head.at < HEAD_TTL_MS) return head.read;
  const read = readAt();
  head = { at: now, read };
  // A failure is not kept: the next request tries again.
  void read.then((r) => {
    if (r == null && head?.read === read) head = null;
  });
  return read;
}

/** For the pages: the depth, or null where there is none to show. */
export async function loadLiquityV2SpDepth(blockNumber?: number): Promise<SpDepth | null> {
  const r = await loadLiquityV2SpDepthAt(blockNumber);
  return r != null && typeof r === "object" ? r : null;
}
