// Live reads for one stability-pool deposit on Liquity V2 or one of its forks.
// SERVER-ONLY: imported by /api/chain/<deployment>/stability-pool, on the
// deployment's chain (Basedollar's on Base). The forks' pools answer Liquity
// V2's getters; a branch below 18 decimals has its collateral figures and its
// price scaled to 1e18 (lib/liquity-v2/sp-decimals.ts).
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
import type { LiquityV2DepositChain } from "@/lib/api/fetch-liquity-v2-sp-chain";
import { spHeadFigures, type ChainResult } from "@/lib/liquity-v2/sp-chain-read";
import { LIQUITY_V2_SP, type SpDeployment, type SpPool } from "@/lib/liquity-v2/sp-deployment";
import { priceToE18, toE18 } from "@/lib/liquity-v2/sp-decimals";

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

export function loadLiquityV2DepositFromChain(branch: string, depositor: string): Promise<LiquityV2DepositChain> {
  const p = LIQUITY_V2_SP.pools.find((x) => x.symbol === branch);
  if (!p) throw new Error(`Liquity V2 has no Stability Pool for ${branch}`);
  return loadSpDepositFromChain(LIQUITY_V2_SP, p, depositor);
}

export async function loadSpDepositFromChain(
  dep: SpDeployment,
  p: SpPool,
  depositor: string,
): Promise<LiquityV2DepositChain> {
  const branch = p.symbol;
  const pool = getAddress(p.pool);
  const feed = getAddress(p.priceFeed);
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
    const client = chainClient(dep.chainId);
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
    const d = p.decimals;
    return {
      branch,
      depositor: depositor.toLowerCase(),
      blockNumber: Number(head.number),
      blockTimestamp: Number(head.timestamp),
      ...figures,
      collGainRaw: toE18(figures.collGainRaw, d) ?? figures.collGainRaw,
      stashRaw: toE18(figures.stashRaw, d) ?? figures.stashRaw,
      priceRaw: priceToE18(figures.priceRaw, d) ?? null,
    };
  } catch (err) {
    console.error(`${dep.name} deposit chain read failed:`, err);
    return stub;
  }
}
