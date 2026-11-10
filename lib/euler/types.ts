// Euler V2 on Base and Arbitrum: the shapes rails-server's at-block routes
// answer (rails-server api/src/services/euler-at-block.ts). Raw chain values,
// bigints as decimal strings; lib/euler/position.ts does the math.

export type EulerChainId = 8453 | 42161;

/** Dollar figures on the Euler pages: each vault's own oracle router at the head block, where the
 *  vault's unit of account is USD (decision 0047 point 7). False removes every dollar line (the card's
 *  value lines and Collateral head, the band's Value column, the vault's Oracle price line, the foot,
 *  the (i) text, the receipts, the info page's line and the coverage cell); figures stay in tokens.
 *  Vaults whose unit is a token keep their values in that token. */
export const EULER_DOLLARS = true;

/** The roster id of each chain's entry. */
export const EULER_SESSION = { 8453: "euler-v2-base", 42161: "euler-v2-arbitrum" } as const;

/** euler-xyz/euler-interfaces, addresses/<chain>/CoreAddresses.json. */
export const EULER_CONTRACTS: Record<EulerChainId, { evc: string; factory: string }> = {
  8453: { evc: "0x5301c7dD20bD945D2013b48ed0DEE3A284ca8989", factory: "0x7F321498A801A191a93C840750ed637149dDf8D0" },
  42161: { evc: "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066", factory: "0x78Df1CF5bf06a7f27f2ACc580B934238C1b80D50" },
};

export interface BlockRef {
  block: number;
  time: number;
}
export interface Token {
  address: string;
  symbol: string;
  decimals: number;
}

export interface EulerHoldingRead {
  vault: string;
  vaultSymbol: string;
  asset: Token;
  shares: string;
  assets: string;
  debt: string;
  collateral: boolean;
  controller: boolean;
}
export interface EulerAccountRead {
  index: number;
  account: string;
  controllers: string[];
  collaterals: string[];
  holdings: EulerHoldingRead[];
}
export interface EulerWalletRead {
  chainId: EulerChainId;
  evc: string;
  factory: string;
  head: BlockRef;
  provider: string;
  owner: string;
  vaultCount: number;
  accounts: EulerAccountRead[];
  findCalls: number;
  truncated: boolean;
}

export interface EulerUnit {
  address: string;
  usd: boolean;
  symbol: string | null;
  decimals: number;
}
export interface EulerCollateralRead {
  vault: string;
  vaultSymbol: string;
  asset: Token;
  shares: string;
  assets: string;
  value: string | null;
  ltvBorrow: number;
  ltvLiquidation: number;
}
export interface EulerLiquidity {
  collateralValue: string;
  liabilityValue: string;
}
export interface EulerPositionRead {
  chainId: EulerChainId;
  evc: string;
  factory: string;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  account: string;
  owner: string | null;
  index: number | null;
  vault: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    asset: Token;
    unit: EulerUnit;
    oracle: string | null;
    interestRate: string;
    interestAccumulator: string;
    totalAssets: string;
    totalBorrows: string;
    shares: string;
    assets: string;
    sharePrice: string;
    debt: string;
    assetPrice: string | null;
  };
  past: {
    sharePrice: string | null;
    interestAccumulator: string | null;
    shares: string | null;
    debt: string | null;
    /** convertToAssets of the shares held now, at the window's block. */
    assets: string | null;
  } | null;
  controllers: string[];
  collaterals: string[];
  borrow: {
    liquidation: EulerLiquidity | null;
    borrowing: EulerLiquidity | null;
    collaterals: EulerCollateralRead[];
    truncated: boolean;
  } | null;
  collateralFor: { vault: string; vaultSymbol: string }[];
}
