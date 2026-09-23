// f(x) Protocol V2 asset catalog — pools, tokens, and the unit systems.
// ----------------------------------------------------------------------------
// f(x) V2 splits yield-bearing collateral into fxUSD (stable) + leveraged
// xPOSITIONs: ERC721 positions on two AaveFundingPools hanging off one
// PoolManager. The roster is chain-verified COMPLETE (exactly two RegisterPool
// events ever, blocks 21529397 / 22081079).
//
// TWO COLLATERAL UNIT SYSTEMS coexist, and every consumer must name which one
// it holds (chain-verified 2026-07-14):
//   * TOKEN units — what Operate.deltaColls emits: the collateral token as
//     transferred (wstETH 18 dp / WBTC 8 dp).
//   * NORMALIZED units — what getPosition.rawColls / LiquidatePosition.colls /
//     PositionSnapshot.price quote against: 1e18, rate-converted via the pool's
//     token-rate provider (wstETH × stEthPerToken → stETH-equivalent; WBTC
//     × 1e10 → the same quantity in 18 dp).
// Debt is fxUSD 1e18 everywhere.

export type FxPoolKey = "wsteth" | "wbtc";

export interface FxPoolMeta {
  key: FxPoolKey;
  /** The AaveFundingPool (also the position ERC721), lowercase. */
  address: string;
  /** The collateral token as deposited/withdrawn (Operate delta units). */
  tokenSymbol: string;
  tokenAddress: string;
  tokenDecimals: number;
  /** The rate-normalized unit getPosition/liquidation/price amounts are in. */
  normalizedSymbol: string;
  /** Deploy block (RegisterPool on the PoolManager). */
  fromBlock: number;
}

export const FX_ADDRESSES = {
  POOL_MANAGER: "0x250893ca4ba5d05626c785e8da758026928fcd24",
  FXUSD: "0x085780639cc2cacd35e474e71f4d000e2405d8f6",
  WSTETH_POOL: "0x6ecfa38fee8a5277b91efda204c235814f0122e8",
  WBTC_POOL: "0xab709e26fa6b0a30c119d8c55b887ded24952473",
} as const;

export const FXUSD_META = { symbol: "fxUSD", decimals: 18, address: FX_ADDRESSES.FXUSD } as const;

export const FX_POOLS: Record<FxPoolKey, FxPoolMeta> = {
  wsteth: {
    key: "wsteth",
    address: FX_ADDRESSES.WSTETH_POOL,
    tokenSymbol: "wstETH",
    tokenAddress: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    tokenDecimals: 18,
    normalizedSymbol: "stETH",
    fromBlock: 21529397,
  },
  wbtc: {
    key: "wbtc",
    address: FX_ADDRESSES.WBTC_POOL,
    tokenSymbol: "WBTC",
    tokenAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    tokenDecimals: 8,
    normalizedSymbol: "WBTC",
    fromBlock: 22081079,
  },
};

export const FX_POOL_KEYS = Object.keys(FX_POOLS) as FxPoolKey[];

export function isFxPoolKey(v: string): v is FxPoolKey {
  return v === "wsteth" || v === "wbtc";
}

/** Position slug used in URLs: `<pool>-<id>` (ids are per-pool ERC721 ids). */
export function fxPositionSlug(pool: FxPoolKey, positionId: string | number): string {
  return `${pool}-${positionId}`;
}

export function parseFxPositionSlug(slug: string): { pool: FxPoolKey; positionId: string } | null {
  const m = /^(wsteth|wbtc)-(\d+)$/.exec(slug);
  if (!m) return null;
  return { pool: m[1] as FxPoolKey, positionId: m[2] };
}
