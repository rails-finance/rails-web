// Live reads for one Liquity V1 stability-pool deposit. SERVER-ONLY: imported
// by /api/chain/liquity-v1/stability-pool.
//
// One head block and one multicall at it: the pool's
// getCompoundedLUSDDeposit, deposits, getDepositorETHGain and
// getDepositorLQTYGain for the depositor (rails-ops
// reference/liquity-v1-stability-pool.md), the PriceFeed's fetchPrice
// (simulated, as liquity-v1-position.ts reads it) with lastGoodPrice beside
// it, for the since-last-touch row's valuation, and the pool's
// getTotalLUSDDeposits for the deposit's share of the pool.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import type { LiquityV1DepositChain } from "@/lib/api/fetch-liquity-v1-sp-chain";
import { spHeadFigures, type ChainResult } from "@/lib/liquity-v1/sp-chain-read";

const POOL_ABI = parseAbi([
  "function getCompoundedLUSDDeposit(address) view returns (uint256)",
  "function deposits(address) view returns (uint256 initialValue, address frontEndTag)",
  "function getDepositorETHGain(address) view returns (uint256)",
  "function getDepositorLQTYGain(address) view returns (uint256)",
  "function getTotalLUSDDeposits() view returns (uint256)",
]);
// fetchPrice mutates on chain; declared view so eth_call simulates it.
const FEED_ABI = parseAbi([
  "function fetchPrice() view returns (uint256)",
  "function lastGoodPrice() view returns (uint256)",
]);

export async function loadLiquityV1DepositFromChain(depositor: string): Promise<LiquityV1DepositChain> {
  const pool = getAddress(LIQUITY_V1_ADDRESSES.STABILITY_POOL);
  const feed = getAddress(LIQUITY_V1_ADDRESSES.PRICE_FEED);
  const who = getAddress(depositor);
  const stub: LiquityV1DepositChain = {
    depositor: depositor.toLowerCase(),
    blockNumber: 0,
    blockTimestamp: 0,
    compoundedRaw: "0",
    recordedRaw: "0",
    frontEnd: "0x0000000000000000000000000000000000000000",
    ethGainRaw: "0",
    lqtyGainRaw: "0",
    priceRaw: null,
    priceStale: false,
    totalDepositsRaw: null,
    chainStale: true,
  };
  try {
    const client = chainClient(MAINNET_CHAIN_ID);
    const head = await client.getBlock();
    const perDepositor = [
      "getCompoundedLUSDDeposit",
      "deposits",
      "getDepositorETHGain",
      "getDepositorLQTYGain",
    ] as const;
    const res = (await client.multicall({
      allowFailure: true,
      blockNumber: head.number,
      contracts: [
        ...perDepositor.map((functionName) => ({ address: pool, abi: POOL_ABI, functionName, args: [who] })),
        { address: feed, abi: FEED_ABI, functionName: "fetchPrice" },
        { address: feed, abi: FEED_ABI, functionName: "lastGoodPrice" },
        { address: pool, abi: POOL_ABI, functionName: "getTotalLUSDDeposits" },
      ] as const,
    })) as ChainResult[];
    const figures = spHeadFigures(res);
    if (figures == null) return stub;
    return {
      depositor: depositor.toLowerCase(),
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      ...figures,
    };
  } catch (err) {
    console.error("Liquity V1 deposit chain read failed:", err);
    return stub;
  }
}
