// The three rails-server routes behind Uniswap on Rails (rails-ops ui-jobs 556):
// a position, a pair's hookless pools and a wallet's positions, each read at
// named blocks. Raw chain values; bigints as decimal strings. The web does the
// math (lib/uniswap/position.ts, lib/uniswap/pairs.ts).
//
// Pure, with type imports only: the unit tests read the modules that use it.

import type { UniChainId } from "./deployments";

export type UniswapVersion = "v3" | "v4";

export interface UniToken {
  /** Checksummed; the zero address for the chain's native coin. */
  address: string;
  symbol: string;
  decimals: number;
}

export interface BlockRef {
  block: number;
  /** Unix seconds. */
  time: number;
}

/** A pool and the position's fee bookkeeping at one block. */
export interface UniPoolRead {
  sqrtPriceX96: string;
  tick: number;
  /** V3 `pool.liquidity()`; V4 `StateView.getLiquidity`. */
  activeLiquidity: string;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  feeGrowthInside0X128: string;
  feeGrowthInside1X128: string;
  positionFeeGrowthInside0LastX128: string;
  positionFeeGrowthInside1LastX128: string;
  /** V3 from the position manager; V4 "0". */
  tokensOwed0: string;
  tokensOwed1: string;
  /** V3 `balanceOf(pool)`; null on V4, whose PoolManager holds every pool. */
  balance0: string | null;
  balance1: string | null;
  /** V3 `slot0().feeProtocol` (two 4-bit denominators); V4 `getSlot0().protocolFee` (two 12-bit pips). */
  protocolFee: number;
  lpFee: number;
}

export interface UniLogAmount {
  block: number;
  amount0: string;
  amount1: string;
}

/** The grid every past read stands on: a fixed count of blocks a day on Ethereum (12-second
 *  slots). Base has none: two-second blocks until Denim (block 53,556,127, 5 Nov 2026), five a
 *  second since, so its reads stand on UTC midnights. Arbitrum's blocks have no fixed time, so its
 *  reads stand on the first multiple of 1,000 blocks at or after each UTC midnight. Optimism's
 *  blocks are two seconds, and its reads stand on the first block at or after each UTC midnight. */
export type { UniChainId } from "./deployments";
export const DAY_BLOCKS_BY_CHAIN: Readonly<Partial<Record<UniChainId, number>>> = { 1: 7_200 };

/** How a receipt names the daily grid: "one each 7,200 blocks", or "one at each UTC midnight". */
export function dayGridPhrase(chainId: UniChainId): string {
  const n = DAY_BLOCKS_BY_CHAIN[chainId];
  if (n) return `one each ${n.toLocaleString("en-US")} blocks`;
  if (chainId === 42161) return "one at the first multiple of 1,000 blocks at or after each UTC midnight";
  if (chainId === 10) return "one at the first block at or after each UTC midnight";
  return "one at each UTC midnight";
}

/** GET /api/at-block/<uniswap|pancakeswap>/position?chain=&version=&id= */
export interface UniPositionRead {
  chainId: UniChainId;
  version: UniswapVersion;
  id: string;
  head: BlockRef;
  /** About 30 days back, on the chain's day grid the store keeps (216,000 blocks on Ethereum). */
  then: BlockRef;
  provider: string;
  owner: string;
  /** V3 the pool's address; V4 the pool id. */
  pool: string;
  token0: UniToken;
  token1: UniToken;
  fee: number;
  tickSpacing: number | null;
  hooks: string | null;
  hasSubscriber: boolean;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  now: UniPoolRead;
  /** Null where the pool did not exist at `then`; where the position did not, its fields are "0" and
   *  `positionLiquidity` is null. */
  past: (UniPoolRead & { positionLiquidity: string | null }) | null;
  opened: BlockRef | null;
  /** Up to 30 reads from `opened` on: the head first, then the multiples of the chain's blocks a day below it. */
  daily: { block: number; time: number; tick: number }[];
  /** V3 only: the position manager's logs for this token id; null where the chain serves no
   *  whole-life logs (Base). */
  history: null | {
    increase: (UniLogAmount & { liquidity: string })[];
    decrease: (UniLogAmount & { liquidity: string })[];
    collect: UniLogAmount[];
  };
  /** PancakeSwap only: the stake where MasterChefV3 holds the NFT, else null. */
  staked?: UniStake | null;
}

/** A PancakeSwap position staked in MasterChefV3. `owner` is then the farm; `user` is the staker. */
export interface UniStake {
  masterChef: string;
  user: string;
  pid: string;
  /** CAKE not yet harvested, raw. */
  pendingCake: string;
  cake: UniToken;
}

/** One pool of a pair at one read block. */
export interface UniPairPoolAt {
  sqrtPriceX96: string;
  tick: number;
  liquidity: string;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  balance0: string | null;
  balance1: string | null;
  protocolFee: number;
}

/** GET /api/at-block/<uniswap|pancakeswap>/pair?chain=&a=&b= */
export interface UniPairRead {
  chainId: UniChainId;
  /** Head, then about 30, 60 and 90 days back. */
  reads: BlockRef[];
  /** The tokens named; the wrapped token appended where the native coin is named. */
  tokens: UniToken[];
  pools: {
    version: UniswapVersion;
    fee: number;
    tickSpacing: number | null;
    key: string;
    token0: string;
    token1: string;
    /** One per `reads` entry; null where the pool did not exist. */
    at: (UniPairPoolAt | null)[];
  }[];
}

/** GET /api/at-block/<uniswap|pancakeswap>/positions?chain=&owner= */
export interface UniPositionsRead {
  chainId: UniChainId;
  head: BlockRef;
  positions: {
    version: UniswapVersion;
    id: string;
    token0: UniToken;
    token1: UniToken;
    fee: number;
    liquidity: string;
    /** PancakeSwap only: held by MasterChefV3 for this owner. */
    staked?: boolean;
  }[];
  /** More than 200 ids in a version; V4 newest first, then V3. */
  truncated: boolean;
}
