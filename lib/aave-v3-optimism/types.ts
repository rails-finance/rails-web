// Aave V3 on Optimism (rails-ops ui-jobs 578): the deployment and the answer
// of rails-server's /api/at-block/aave-v3-optimism/position route (api/src/
// services/aave-v3-optimism-at-block.ts). Raw chain values, bigints as decimal
// strings; lib/aave-v3-optimism/position.ts does the math. The markets route
// answers the market overview's shape (lib/api/fetch-aave-market-overview.ts).
//
// Addresses from Aave's address book (aave-dao/aave-address-book
// src/AaveV3Optimism.sol at 73676d40), each checked on Optimism on 11 Nov 2026:
// code at all four, the PoolAddressesProvider's getPool() and getPriceOracle()
// name the Pool and the oracle, and the Pool's ADDRESSES_PROVIDER() is the
// provider.

export const OP_SESSION = "aave-v3-optimism" as const;
export const OP_ROUTE = "/optimism/aave-v3";

export const AAVE_V3_OPTIMISM_CONTRACTS = {
  pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  addressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
  uiPoolDataProvider: "0x68100bD5345eA474D93577127C11F39FF8463e93",
  oracle: "0xD81eb3728a631871a7eBBaD631b5f424909f0c77",
} as const;

export type BlockRef = { block: number; time: number };

export const isOpWallet = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);

export interface OpIndexes {
  /** getReserveNormalizedIncome, a ray. */
  income: string;
  /** getReserveNormalizedVariableDebt, a ray. */
  debt: string;
}

export interface OpPositionReserve {
  asset: string;
  symbol: string;
  decimals: number;
  id: number;
  aToken: string;
  variableDebtToken: string;
  /** getReserveData.configuration, decimal. */
  configuration: string;
  /** Rays a year. */
  liquidityRate: string;
  variableBorrowRate: string;
  scaledSupply: string;
  scaledDebt: string;
  isCollateral: boolean;
  indexes: OpIndexes;
  /** getAssetPrice, 8 decimals; null where the oracle gave none. */
  price: string | null;
  priceSource: string | null;
  past: { scaledSupply: string; scaledDebt: string; indexes: OpIndexes } | null;
}

export interface OpPositionRead {
  chainId: 10;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  wallet: string;
  pool: string;
  oracle: string;
  uiPoolDataProvider: string;
  addressesProvider: string;
  account: {
    totalCollateralBase: string;
    totalDebtBase: string;
    availableBorrowsBase: string;
    currentLiquidationThreshold: string;
    ltv: string;
    healthFactor: string;
  };
  emode: {
    id: number;
    label: string | null;
    ltv: number | null;
    lt: number | null;
    collateralBitmap: string | null;
  } | null;
  emodeThen: number | null;
  reserves: OpPositionReserve[];
}
