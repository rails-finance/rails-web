// Morpho Blue on Arc (rails-ops ui-jobs 577): the answers of rails-server's
// /api/at-block/morpho-arc routes (api/src/services/morpho-arc-at-block.ts),
// raw chain values with bigints as decimal strings. Client-safe.

export const MORPHO_ARC_SESSION = "morpho-arc";
export const MORPHO_ARC_ROUTE = "/arc/morpho";

/** Morpho's addresses page (docs.morpho.org, Morpho Blue, Arc), checked on chain 11 Nov 2026. */
export const MORPHO_ARC_CONTRACTS = {
  morpho: "0x34cd04070dd72b14e241112f6d83812df5af7fcd",
  adaptiveCurveIrm: "0xf02615d094fc02fc031c35fe705e175aa4653f20",
} as const;

export type BlockRef = { block: number; time: number };
type Str = string | null;

export interface ArcMorphoParams {
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: string;
}
export interface ArcMorphoState {
  totalSupplyAssets: string;
  totalSupplyShares: string;
  totalBorrowAssets: string;
  totalBorrowShares: string;
  lastUpdate: string;
  fee: string;
}
export interface ArcMorphoMarket extends ArcMorphoParams {
  id: string;
  state: ArcMorphoState | null;
  borrowRate: Str;
  rateAtTarget: Str;
  price: Str;
}
export interface ArcMorphoListedMarket extends ArcMorphoMarket {
  createdBlock: number;
  createdTx: string;
}
export interface ArcMorphoToken {
  symbol: Str;
  decimals: number | null;
  name: Str;
}
export interface ArcUsdFeed {
  token: string;
  feed: string;
  name: string;
  description: Str;
  decimals: number | null;
  answer: Str;
  updatedAt: Str;
}
export interface ArcMorphoList {
  from: number;
  keptTo: number;
  toBlock: number;
}
export interface ArcMorphoMarketsRead {
  chainId: 5042;
  head: BlockRef;
  provider: string;
  morpho: string;
  irm: string;
  list: ArcMorphoList;
  markets: ArcMorphoListedMarket[];
  tokens: Record<string, ArcMorphoToken>;
  loanTokenSupply: Record<string, Str>;
  usdFeeds: ArcUsdFeed[];
}
export interface ArcOracleFeed {
  slot: "BASE_FEED_1" | "BASE_FEED_2" | "QUOTE_FEED_1" | "QUOTE_FEED_2";
  address: string;
  description: Str;
  decimals: number | null;
  roundId: Str;
  answer: Str;
  updatedAt: Str;
}
export interface ArcMorphoMarketRead {
  chainId: 5042;
  head: BlockRef;
  provider: string;
  morpho: string;
  market: ArcMorphoMarket;
  oracleFeeds: ArcOracleFeed[] | null;
  oracleVaults: { base: Str; quote: Str } | null;
  tokens: Record<string, ArcMorphoToken>;
  usdFeeds: ArcUsdFeed[];
}
export interface ArcMorphoPosition {
  supplyShares: string;
  borrowShares: string;
  collateral: string;
}
export interface ArcMorphoWalletRead {
  chainId: 5042;
  head: BlockRef;
  provider: string;
  wallet: string;
  list: ArcMorphoList;
  marketsRead: number;
  positions: (ArcMorphoListedMarket & { position: ArcMorphoPosition })[];
  tokens: Record<string, ArcMorphoToken>;
  usdFeeds: ArcUsdFeed[];
}
export interface ArcMorphoPositionRead {
  chainId: 5042;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  wallet: string;
  market: ArcMorphoMarket;
  position: ArcMorphoPosition;
  past: { position: ArcMorphoPosition; state: ArcMorphoState; borrowRate: Str } | null;
  tokens: Record<string, ArcMorphoToken>;
  usdFeeds: ArcUsdFeed[];
}

const WALLET = /^0x[0-9a-fA-F]{40}$/;
const MARKET_ID = /^0x[0-9a-fA-F]{64}$/;
export const isArcWallet = (w: string) => WALLET.test(w);
export const isArcMarketId = (id: string) => MARKET_ID.test(id);
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
