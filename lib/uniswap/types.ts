// The three rails-server routes behind Uniswap on Rails (rails-ops ui-jobs 556):
// a position, a pair's hookless pools and a wallet's positions, each read at
// named blocks. Raw chain values; bigints as decimal strings. The web does the
// math (lib/uniswap/position.ts, lib/uniswap/pairs.ts).
//
// Pure, with no imports: the unit tests read the modules that use it.

export type UniswapVersion = "v3" | "v4";

export interface UniToken {
  /** Checksummed; the zero address for native ETH. */
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

/** The chains the at-block routes answer for, and each one's blocks a day: the grid every past
 *  read stands on (Ethereum's 12-second slots, Base's 2-second blocks). */
export type UniChainId = 1 | 8453;
export const DAY_BLOCKS_BY_CHAIN: Readonly<Record<UniChainId, number>> = { 1: 7_200, 8453: 43_200 };

/** GET /api/at-block/uniswap/position?version=&id= */
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
  /** V3 only: the position manager's logs for this token id. */
  history: null | {
    increase: (UniLogAmount & { liquidity: string })[];
    decrease: (UniLogAmount & { liquidity: string })[];
    collect: UniLogAmount[];
  };
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

/** GET /api/at-block/uniswap/pair?a=&b= */
export interface UniPairRead {
  chainId: UniChainId;
  /** Head, then about 30, 60 and 90 days back. */
  reads: BlockRef[];
  /** The tokens named; WETH appended where ETH is named. */
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

/** GET /api/at-block/uniswap/positions?owner= */
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
  }[];
  /** More than 200 ids in a version; V4 newest first, then V3. */
  truncated: boolean;
}
