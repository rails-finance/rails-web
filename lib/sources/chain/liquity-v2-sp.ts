// Live reads for one Liquity V2 stability-pool deposit. SERVER-ONLY: imported
// by /api/chain/liquity-v2/stability-pool.
//
// One head block and one multicall at it: the branch pool's
// getCompoundedBoldDeposit, deposits, getDepositorCollGain, stashedColl and
// getDepositorYieldGainWithPending for the depositor (rails-ops
// reference/liquity-v2-stability-pool-deposits.md), and the branch PriceFeed's
// fetchPrice (simulated, as lib/sources/chain/liquity-fork-prices.ts reads it)
// with lastGoodPrice beside it, for the since-last-touch row's valuation, and
// the pool's getTotalBoldDeposits for the deposit's share of the pool.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { LIQUITY_V2_SP_POOLS } from "@/lib/liquity-v2/sp-catalog";
import type { SpBranch } from "@/lib/liquity-v2/sp-routes";
import type { LiquityV2DepositChain } from "@/lib/api/fetch-liquity-v2-sp-chain";
import { spHeadFigures, type ChainResult } from "@/lib/liquity-v2/sp-chain-read";

const POOL_ABI = parseAbi([
  "function getCompoundedBoldDeposit(address) view returns (uint256)",
  "function deposits(address) view returns (uint256)",
  "function getDepositorCollGain(address) view returns (uint256)",
  "function stashedColl(address) view returns (uint256)",
  "function getDepositorYieldGainWithPending(address) view returns (uint256)",
  "function getTotalBoldDeposits() view returns (uint256)",
]);
// fetchPrice mutates on chain; declared view so eth_call simulates it.
const FEED_ABI = parseAbi([
  "function fetchPrice() view returns (uint256, bool)",
  "function lastGoodPrice() view returns (uint256)",
]);

export async function loadLiquityV2DepositFromChain(
  branch: SpBranch,
  depositor: string,
): Promise<LiquityV2DepositChain> {
  const pool = getAddress(LIQUITY_V2_SP_POOLS[branch]);
  const feed = getAddress(LIQUITY_V2_BRANCHES[branch.toLowerCase()].priceFeed);
  const who = getAddress(depositor);
  const stub: LiquityV2DepositChain = {
    branch,
    depositor: depositor.toLowerCase(),
    blockNumber: 0,
    blockTimestamp: 0,
    compoundedRaw: "0",
    recordedRaw: "0",
    collGainRaw: "0",
    stashRaw: "0",
    yieldGainRaw: "0",
    priceRaw: null,
    priceStale: false,
    totalDepositsRaw: null,
    chainStale: true,
  };
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    const head = await client.getBlock();
    const perDepositor = [
      "getCompoundedBoldDeposit",
      "deposits",
      "getDepositorCollGain",
      "stashedColl",
      "getDepositorYieldGainWithPending",
    ] as const;
    const res = (await client.multicall({
      allowFailure: true,
      blockNumber: head.number,
      contracts: [
        ...perDepositor.map((functionName) => ({ address: pool, abi: POOL_ABI, functionName, args: [who] })),
        { address: feed, abi: FEED_ABI, functionName: "fetchPrice" },
        { address: feed, abi: FEED_ABI, functionName: "lastGoodPrice" },
        { address: pool, abi: POOL_ABI, functionName: "getTotalBoldDeposits" },
      ] as const,
    })) as ChainResult[];
    const figures = spHeadFigures(res);
    if (figures == null) return stub;
    return {
      branch,
      depositor: depositor.toLowerCase(),
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      ...figures,
    };
  } catch (err) {
    console.error("Liquity V2 deposit chain read failed:", err);
    return stub;
  }
}
