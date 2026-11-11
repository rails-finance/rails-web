// Morpho Blue read on visit, one module for each chain it runs on at the head
// (rails-ops ui-jobs 577 and 578): the deployments, and the answers of
// rails-server's /api/at-block/morpho-arc and /api/at-block/morpho-optimism
// routes (api/src/services/morpho-at-block.ts), raw chain values with bigints
// as decimal strings. Client-safe, with no `@/` import.

/** One chain's Morpho Blue, read when a page opens. */
export interface MorphoAtBlockDeployment {
  /** The chain's key in data hooks: `data-morpho-<key>-…`. */
  key: "arc" | "optimism";
  chainId: 5042 | 10;
  /** The chain's name in the page's words. */
  chain: "Arc" | "Optimism";
  session: "morpho-arc" | "morpho-optimism";
  route: "/arc/morpho" | "/optimism/morpho";
  /** The rails-server route segment: /api/at-block/<api>/… */
  api: "morpho-arc" | "morpho-optimism";
  contracts: { morpho: string; adaptiveCurveIrm: string };
  /** Aave V3's AaveOracle on the chain, which prices a loan token with no Chainlink feed (rails-server
   *  names it as a price's `source`); null where rails-server reads only Chainlink feeds. */
  aaveOracle: { name: string; address: string } | null;
  /** The position page's "Not indexed yet" line, as every Optimism explorer carries (ui-jobs 578). */
  notIndexedLine: boolean;
}

/** Morpho's addresses page (docs.morpho.org, Morpho Blue, Arc), checked on chain 11 Nov 2026. */
export const MORPHO_ARC: MorphoAtBlockDeployment = {
  key: "arc",
  chainId: 5042,
  chain: "Arc",
  session: "morpho-arc",
  route: "/arc/morpho",
  api: "morpho-arc",
  contracts: {
    morpho: "0x34cd04070dd72b14e241112f6d83812df5af7fcd",
    adaptiveCurveIrm: "0xf02615d094fc02fc031c35fe705e175aa4653f20",
  },
  aaveOracle: null,
  notIndexedLine: false,
};

/** Morpho's addresses page (docs.morpho.org, Morpho Blue, OP Mainnet), checked on chain 11 Nov 2026:
 *  code at both from block 130,770,075, `isIrmEnabled(IRM)` true. */
export const MORPHO_OPTIMISM: MorphoAtBlockDeployment = {
  key: "optimism",
  chainId: 10,
  chain: "Optimism",
  session: "morpho-optimism",
  route: "/optimism/morpho",
  api: "morpho-optimism",
  contracts: {
    morpho: "0xce95afbb8ea029495c66020883f87aae8864af92",
    adaptiveCurveIrm: "0x8cd70a8f399428456b29546bc5dbe10ab6a06ef6",
  },
  // Aave V3 Optimism's AaveOracle (aave-address-book AaveV3Optimism.sol).
  aaveOracle: { name: "Aave V3 Optimism oracle", address: "0xd81eb3728a631871a7ebbad631b5f424909f0c77" },
  notIndexedLine: true,
};

export const MORPHO_ARC_CONTRACTS = MORPHO_ARC.contracts;
export const MORPHO_OPTIMISM_CONTRACTS = MORPHO_OPTIMISM.contracts;

export type BlockRef = { block: number; time: number };
type Str = string | null;

export interface MorphoAtBlockParams {
  loanToken: string;
  collateralToken: string;
  oracle: string;
  irm: string;
  lltv: string;
}
export interface MorphoAtBlockState {
  totalSupplyAssets: string;
  totalSupplyShares: string;
  totalBorrowAssets: string;
  totalBorrowShares: string;
  lastUpdate: string;
  fee: string;
}
export interface MorphoAtBlockMarket extends MorphoAtBlockParams {
  id: string;
  state: MorphoAtBlockState | null;
  borrowRate: Str;
  rateAtTarget: Str;
  price: Str;
  /** Why the markets list leaves the market out: a test token, or no supply ever (rails-server's
   *  unlistedReason). Absent on a position's read. */
  unlisted?: "test-token" | "never-funded" | null;
}
export interface MorphoAtBlockListedMarket extends MorphoAtBlockMarket {
  createdBlock: number;
  createdTx: string;
  createdTime: number;
}
export interface MorphoAtBlockToken {
  symbol: Str;
  decimals: number | null;
  name: Str;
}
export interface AtBlockUsdFeed {
  token: string;
  feed: string;
  name: string;
  description: Str;
  decimals: number | null;
  answer: Str;
  updatedAt: Str;
  /** Which read priced it, where the chain has an AaveOracle: a Chainlink feed's latestRoundData, or
   *  the AaveOracle's getAssetPrice (then `feed` is the oracle). Absent on Arc: a Chainlink feed. */
  source?: "chainlink" | "aave-oracle";
}
export interface MorphoAtBlockList {
  from: number;
  keptTo: number;
  toBlock: number;
}
export interface MorphoAtBlockMarketsRead {
  chainId: 5042 | 10;
  head: BlockRef;
  provider: string;
  morpho: string;
  irm: string;
  list: MorphoAtBlockList;
  markets: MorphoAtBlockListedMarket[];
  tokens: Record<string, MorphoAtBlockToken>;
  loanTokenSupply: Record<string, Str>;
  usdFeeds: AtBlockUsdFeed[];
}
export interface AtBlockOracleFeed {
  slot: "BASE_FEED_1" | "BASE_FEED_2" | "QUOTE_FEED_1" | "QUOTE_FEED_2";
  address: string;
  description: Str;
  decimals: number | null;
  roundId: Str;
  answer: Str;
  updatedAt: Str;
}
export interface MorphoAtBlockMarketRead {
  chainId: 5042 | 10;
  head: BlockRef;
  provider: string;
  morpho: string;
  market: MorphoAtBlockMarket;
  oracleFeeds: AtBlockOracleFeed[] | null;
  oracleVaults: { base: Str; quote: Str } | null;
  tokens: Record<string, MorphoAtBlockToken>;
  usdFeeds: AtBlockUsdFeed[];
}
export interface MorphoAtBlockPosition {
  supplyShares: string;
  borrowShares: string;
  collateral: string;
}
export interface MorphoAtBlockWalletRead {
  chainId: 5042 | 10;
  head: BlockRef;
  provider: string;
  wallet: string;
  list: MorphoAtBlockList;
  marketsRead: number;
  positions: (MorphoAtBlockListedMarket & { position: MorphoAtBlockPosition })[];
  tokens: Record<string, MorphoAtBlockToken>;
  usdFeeds: AtBlockUsdFeed[];
}
export interface MorphoAtBlockPositionRead {
  chainId: 5042 | 10;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  wallet: string;
  market: MorphoAtBlockMarket;
  position: MorphoAtBlockPosition;
  past: { position: MorphoAtBlockPosition; state: MorphoAtBlockState; borrowRate: Str } | null;
  tokens: Record<string, MorphoAtBlockToken>;
  usdFeeds: AtBlockUsdFeed[];
}

const WALLET = /^0x[0-9a-fA-F]{40}$/;
const MARKET_ID = /^0x[0-9a-fA-F]{64}$/;
export const isMorphoWallet = (w: string) => WALLET.test(w);
export const isMorphoMarketId = (id: string) => MARKET_ID.test(id);
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
