// rails-server's Fluid-on-Base at-block answers (rails-ops ui-jobs 574;
// rails-server services/fluid-base-at-block.ts): raw chain values, bigints as
// decimal strings. lib/fluid-base/position.ts does the math.

export type BlockRef = { block: number; time: number };
export type FluidBaseToken = { address: string; symbol: string; decimals: number };

/** One side of a vault: a token, or DEX shares of a two-token pool. */
export type FluidBaseLeg = {
  kind: "token" | "shares";
  token: FluidBaseToken;
  token1: FluidBaseToken | null;
  /** What Aave V3 Base's oracle priced: the token, WETH for native ETH; null for shares. */
  priceAsset: string | null;
};

/** The position and its vault at one block. */
export type FluidBaseRead = {
  owner: string;
  supply: string;
  borrow: string;
  dustBorrow: string;
  tick: string;
  isLiquidated: boolean;
  isSupplyPosition: boolean;
  /** 1e4 = 100%. */
  collateralFactor: number;
  liquidationThreshold: number;
  liquidationMaxLimit: number;
  liquidationPenalty: number;
  oracle: string;
  oraclePriceOperate: string;
  oraclePriceLiquidate: string;
  vaultSupplyExchangePrice: string;
  vaultBorrowExchangePrice: string;
  /** Annual percent × 100. */
  supplyRateVault: string;
  borrowRateVault: string;
  totalPositions: string;
  totalSupplyVault: string;
  totalBorrowVault: string;
};

export type FluidBasePositionRead = {
  chainId: 8453;
  id: string;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  resolver: string;
  factory: string;
  vault: string;
  vaultId: number;
  vaultType: number;
  supplyLeg: FluidBaseLeg;
  borrowLeg: FluidBaseLeg;
  now: FluidBaseRead;
  past: FluidBaseRead | null;
  usd: { oracle: string; baseUnit: string; supply: string | null; borrow: string | null };
};

export type FluidBasePositionsRead = {
  chainId: 8453;
  head: BlockRef;
  resolver: string;
  positions: {
    id: string;
    vault: string;
    vaultId: number;
    vaultType: number;
    supplyLeg: FluidBaseLeg;
    borrowLeg: FluidBaseLeg;
    supply: string;
    borrow: string;
    isLiquidated: boolean;
  }[];
  empty: number;
  truncated: boolean;
};

/** The contracts rails-server reads (Instadapp/fluid-contracts-public, deployments/base). */
export const FLUID_BASE_CONTRACTS = {
  vaultResolver: "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC",
  vaultFactory: "0x324c5Dc1fC42c7a4D43d92df1eBA58a54d13Bf2d",
  aaveOracle: "0x2Cc0Fc26eD4563A5ce5e8bdcfe1A2878676Ae156",
} as const;

/** A position id as the route takes it: a decimal NFT id. */
export const isFluidBaseId = (id: string): boolean => /^\d{1,20}$/.test(id);
