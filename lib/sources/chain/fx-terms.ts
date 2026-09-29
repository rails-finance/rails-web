// One f(x) pool's terms at head, for the position card: the rebalance and
// liquidation lines with their bonuses, the borrow ceiling, the funding rate
// on collateral, the pool's default fee schedule, the manager's share of a
// bonus, and whether redemption is open. The pools page reads the same
// getters with the whole tick ladder (fx-system.ts); the card needs only these.
//
// Two eth_calls (Multicall3): the pool's and manager's getters, then the
// PoolConfiguration's. Kept in process for ten minutes; the route caches at
// the edge for as long.
//
// SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { FX_ADDRESSES, FX_POOLS, type FxPoolKey } from "@/lib/fx/asset-catalog";

const POOL_ABI = parseAbi([
  "function getDebtRatioRange() view returns (uint256,uint256)",
  "function getRebalanceRatios() view returns (uint256,uint256)",
  "function getLiquidateRatios() view returns (uint256,uint256)",
  "function configuration() view returns (address)",
]);
const PM_ABI = parseAbi(["function getLiquidationExpenseRatio() view returns (uint256)"]);
const CONFIG_ABI = parseAbi([
  "function getLongPoolFundingRatio(address) view returns (uint256)",
  "function getPoolFeeRatio(address,address) view returns (uint256,uint256,uint256,uint256)",
  "function isRedeemAllowed() view returns (bool)",
]);
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** Fractions throughout (0.88 = 88%). */
export interface FxPoolTerms {
  pool: FxPoolKey;
  block: number;
  maxBorrowRatio: number;
  rebalanceRatio: number;
  rebalanceBonus: number;
  liquidateRatio: number;
  liquidateBonus: number;
  /** The manager's share of a rebalance or liquidation bonus. */
  expenseRatio: number;
  /** Annual funding charged on collateral. */
  fundingRatio: number;
  /** The default schedule; a router can carry its own. */
  fees: { supply: number; withdraw: number; borrow: number; repay: number };
  redeemAllowed: boolean;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<FxPoolKey, { at: number; p: Promise<FxPoolTerms> }>();

const wad = (v: bigint): number => Number(v) / 1e18;
const fee = (v: bigint): number => Number(v) / 1e9;

async function read(pool: FxPoolKey): Promise<FxPoolTerms> {
  const client = alchemyClient();
  const address = getAddress(FX_POOLS[pool].address);
  const block = await client.getBlockNumber();
  const at = { blockNumber: block };
  const [range, reb, liq, configuration, expense] = await client.multicall({
    allowFailure: false,
    ...at,
    contracts: [
      { address, abi: POOL_ABI, functionName: "getDebtRatioRange" },
      { address, abi: POOL_ABI, functionName: "getRebalanceRatios" },
      { address, abi: POOL_ABI, functionName: "getLiquidateRatios" },
      { address, abi: POOL_ABI, functionName: "configuration" },
      { address: getAddress(FX_ADDRESSES.POOL_MANAGER), abi: PM_ABI, functionName: "getLiquidationExpenseRatio" },
    ],
  });
  const [funding, fees, redeemAllowed] = await client.multicall({
    allowFailure: false,
    ...at,
    contracts: [
      { address: configuration, abi: CONFIG_ABI, functionName: "getLongPoolFundingRatio", args: [address] },
      { address: configuration, abi: CONFIG_ABI, functionName: "getPoolFeeRatio", args: [address, ZERO_ADDRESS] },
      { address: configuration, abi: CONFIG_ABI, functionName: "isRedeemAllowed" },
    ],
  });
  return {
    pool,
    block: Number(block),
    maxBorrowRatio: wad(range[1]),
    rebalanceRatio: wad(reb[0]),
    rebalanceBonus: fee(reb[1]),
    liquidateRatio: wad(liq[0]),
    liquidateBonus: fee(liq[1]),
    expenseRatio: fee(expense),
    fundingRatio: wad(funding),
    fees: { supply: fee(fees[0]), withdraw: fee(fees[1]), borrow: fee(fees[2]), repay: fee(fees[3]) },
    redeemAllowed,
  };
}

export function readFxPoolTerms(pool: FxPoolKey): Promise<FxPoolTerms> {
  const hit = cache.get(pool);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.p;
  const p = read(pool);
  cache.set(pool, { at: Date.now(), p });
  p.catch(() => cache.delete(pool));
  return p;
}
