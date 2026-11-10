// The two rails-server routes behind Aerodrome on Rails (rails-ops ui-jobs 566):
// a Slipstream position and a wallet's positions on Base, each read at named
// blocks. Raw chain values; bigints as decimal strings. The web does the math
// (lib/aerodrome/position.ts).
//
// Pure, with no imports but types: the unit tests read the modules that use it.

import type { BlockRef, UniToken } from "../uniswap/types";

/** Slipstream's three position managers: the first factory, the factory with gauge caps, and gauges v3.
 *  Token ids overlap across them, so a position is keyed by both. */
export type AeroDeployment = "initial" | "caps" | "gv3";
export const AERO_DEPLOYMENTS: readonly AeroDeployment[] = ["initial", "caps", "gv3"];
export const isDeployment = (d: string): d is AeroDeployment => (AERO_DEPLOYMENTS as readonly string[]).includes(d);

/** The contracts the receipts name (checked on chain 10 Nov 2026). */
export const AERO_CONTRACTS = {
  nfpm: {
    initial: "0x827922686190790b37229fd06084350E74485b72",
    caps: "0xa990C6a764b73BF43cee5Bb40339c3322FB9D55F",
    gv3: "0xe1f8cd9AC4e4A65F54f38a5CdAfCA44f6dD68b53",
  },
  factory: {
    initial: "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A",
    caps: "0xaDe65c38CD4849aDBA595a4323a8C7DdfE89716a",
    gv3: "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef",
  },
  voter: "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5",
  aero: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
} as const satisfies {
  nfpm: Record<AeroDeployment, string>;
  factory: Record<AeroDeployment, string>;
  voter: string;
  aero: string;
};

/** A Slipstream pool and the position's bookkeeping at one block. */
export interface AeroPoolRead {
  sqrtPriceX96: string;
  tick: number;
  /** `pool.liquidity()`: staked and unstaked liquidity in range. */
  activeLiquidity: string;
  /** Per unit of unstaked liquidity, after the unstaked fee. */
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  feeGrowthInside0X128: string;
  feeGrowthInside1X128: string;
  positionFeeGrowthInside0LastX128: string;
  positionFeeGrowthInside1LastX128: string;
  tokensOwed0: string;
  tokensOwed1: string;
  balance0: string | null;
  balance1: string | null;
  /** `pool.fee()`, pips (1e6 = 100%). */
  lpFee: number;
  /** `pool.unstakedFee()`, pips taken from unstaked liquidity's fees. */
  unstakedFee: number;
  /** `pool.stakedLiquidity()`: staked liquidity in range. */
  stakedLiquidity: string;
  /** Per unit of staked liquidity, brought up to the block's time. */
  rewardGrowthGlobalX128: string;
  rewardGrowthInsideX128: string;
  /** AERO wei a second to all staked liquidity. */
  rewardRate: string;
}

/** An Aerodrome v2 volatile pool that prices AERO (AERO is token1 in both today). */
export interface AeroPriceLeg {
  pool: string;
  kind: "v2-volatile";
  token0: string;
  token1: string;
  now: { reserve0: string; reserve1: string };
  then: { reserve0: string; reserve1: string } | null;
}

export interface AeroStaked {
  gauge: string;
  /** The wallet that staked it; null when none is found. */
  depositor: string | null;
  /** Gauges v3 only. */
  depositTimestamp: number | null;
  /** Claimable AERO (wei) after any early-unstake penalty; null without a depositor. */
  earned: string | null;
  /** AERO settled at the gauge's last update for this id, unpaid. */
  rewards: string;
  rewardGrowthInsideLastX128: string;
  /** Gauges v3 only. */
  penaltyBps: number | null;
  minStakeSeconds: number | null;
}

/** GET /api/at-block/aerodrome/position?deployment=&id= */
export interface AeroPositionRead {
  chainId: 8453;
  deployment: AeroDeployment;
  nfpm: string;
  id: string;
  head: BlockRef;
  /** The UTC midnight 30 days before the head's last midnight. */
  then: BlockRef;
  provider: string;
  /** `ownerOf(id)`: the gauge while staked. */
  owner: string;
  pool: string;
  token0: UniToken;
  token1: UniToken;
  fee: number;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  now: AeroPoolRead;
  /** Null when the pool had no state at `then`; `positionLiquidity` null when the NFT did not exist then. */
  past: (AeroPoolRead & { positionLiquidity: string | null }) | null;
  opened: null;
  /** The head, then up to 29 UTC midnights, newest first; `positionLiquidity` null before the NFT existed. */
  daily: { block: number; time: number; tick: number; positionLiquidity: string | null }[];
  staked: AeroStaked | null;
  /** Staked at `then`; null when the NFT did not exist then. */
  stakedThen: boolean | null;
  aero: { usdc: AeroPriceLeg; weth: AeroPriceLeg };
}

/** GET /api/at-block/aerodrome/positions?owner= */
export interface AeroPositionsRead {
  chainId: 8453;
  head: BlockRef;
  positions: {
    deployment: AeroDeployment;
    id: string;
    token0: UniToken;
    token1: UniToken;
    tickSpacing: number;
    liquidity: string;
    staked: boolean;
    gauge: string | null;
  }[];
  truncated: boolean;
}
