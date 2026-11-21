// Live reads for one Liquity V1 LQTY stake. SERVER-ONLY: imported by
// /api/chain/liquity-v1/staking and the wallet page's read.
//
// One head block and one multicall at it: LQTYStaking's stakes,
// getPendingLUSDGain and getPendingETHGain for the staker and its
// totalLQTYStaked, and the PriceFeed's fetchPrice (simulated, as
// liquity-v1-position.ts reads it) with lastGoodPrice beside it, which the
// wallet page values the ETH fees at.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import type { LiquityV1StakeChain } from "@/lib/api/fetch-liquity-v1-staking-chain";
import { stakeHeadFigures, type ChainResult } from "@/lib/liquity-v1/staking-chain-read";

const STAKING_ABI = parseAbi([
  "function stakes(address) view returns (uint256)",
  "function getPendingLUSDGain(address) view returns (uint256)",
  "function getPendingETHGain(address) view returns (uint256)",
  "function totalLQTYStaked() view returns (uint256)",
]);
// fetchPrice mutates on chain; declared view so eth_call simulates it.
const FEED_ABI = parseAbi([
  "function fetchPrice() view returns (uint256)",
  "function lastGoodPrice() view returns (uint256)",
]);

export async function loadLiquityV1StakeFromChain(staker: string): Promise<LiquityV1StakeChain> {
  const staking = getAddress(LIQUITY_V1_ADDRESSES.LQTY_STAKING);
  const feed = getAddress(LIQUITY_V1_ADDRESSES.PRICE_FEED);
  const who = getAddress(staker);
  const stub: LiquityV1StakeChain = {
    staker: staker.toLowerCase(),
    blockNumber: 0,
    blockTimestamp: 0,
    stakeRaw: "0",
    lusdGainRaw: "0",
    ethGainRaw: "0",
    totalStakedRaw: null,
    priceRaw: null,
    priceStale: false,
    chainStale: true,
  };
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    const head = await client.getBlock();
    const res = (await client.multicall({
      allowFailure: true,
      blockNumber: head.number,
      contracts: [
        { address: staking, abi: STAKING_ABI, functionName: "stakes", args: [who] },
        { address: staking, abi: STAKING_ABI, functionName: "getPendingLUSDGain", args: [who] },
        { address: staking, abi: STAKING_ABI, functionName: "getPendingETHGain", args: [who] },
        { address: staking, abi: STAKING_ABI, functionName: "totalLQTYStaked" },
        { address: feed, abi: FEED_ABI, functionName: "fetchPrice" },
        { address: feed, abi: FEED_ABI, functionName: "lastGoodPrice" },
      ] as const,
    })) as ChainResult[];
    const figures = stakeHeadFigures(res);
    if (figures == null) return stub;
    return {
      staker: staker.toLowerCase(),
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      ...figures,
    };
  } catch (err) {
    console.error("Liquity V1 stake chain read failed:", err);
    return stub;
  }
}
