// Compound V3 on Optimism (rails-ops ui-jobs 578): the answers of rails-server's
// /api/at-block/compound-v3-optimism routes (api/src/services/
// compound-v3-optimism-at-block.ts). Raw chain values, bigints as decimal
// strings; lib/compound-v3-optimism/position.ts does the math. The markets
// route answers lib/sources/chain/compound-markets.ts's shape. Imports nothing
// through `@/`, so the tests run the math as is.

export const OPC_SESSION = "compound-v3-optimism" as const;
export const OPC_ROUTE = "/optimism/compound-v3";

export const opcWalletHref = (wallet: string) => `${OPC_ROUTE}/${wallet.toLowerCase()}`;
export const opcPositionHref = (key: string, wallet: string) => `${OPC_ROUTE}/${key}/${wallet.toLowerCase()}`;

export type BlockRef = { block: number; time: number };

export const isOpcWallet = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);

/** One collateral asset the account holds. */
export interface OpcCollateral {
  asset: string;
  symbol: string;
  /** getAssetInfo.scale, 10^decimals. */
  scale: string;
  priceFeed: string;
  /** getPrice(priceFeed), 8 decimals in the Comet's quote unit. */
  price: string;
  balance: string;
  /** 1e18-scaled. */
  borrowCollateralFactor: string;
  liquidateCollateralFactor: string;
  liquidationFactor: string;
}

/** One Comet's account at the head. */
export interface OpcAccount {
  key: string;
  label: string;
  comet: string;
  baseSymbol: string;
  baseToken: string;
  baseDecimals: number;
  quoteUnit: "USD" | "ETH";
  baseFeed: string;
  basePrice: string;
  supply: string;
  borrow: string;
  /** userBasic.principal: above zero a supply, below zero a debt. */
  principal: string;
  isBorrowCollateralized: boolean;
  isLiquidatable: boolean;
  collateral: OpcCollateral[];
}

/** The WETH Comet's dollar leg: the USDC Comet's getPrice of WETH. */
export interface OpcEthUsd {
  comet: string;
  priceFeed: string;
  price: string;
}

export interface OpcWalletRead {
  chainId: 10;
  head: BlockRef;
  provider: string;
  wallet: string;
  comets: OpcAccount[];
  ethUsd: OpcEthUsd | null;
}

export interface OpcPositionRead {
  chainId: 10;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  wallet: string;
  account: OpcAccount;
  ethUsd: OpcEthUsd | null;
  utilization: string;
  /** Per second, 1e18. */
  supplyRate: string;
  borrowRate: string;
  rewards: { contract: string; token: string; owed: string } | null;
  past: { principal: string; supply: string; borrow: string } | null;
}
