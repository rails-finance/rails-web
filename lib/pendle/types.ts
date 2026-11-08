// The shapes of rails-server's /api/pendle routes (api/src/routes/pendle.ts and
// services/pendle-positions.ts). Amounts are raw integers as decimal strings,
// with each token's decimals beside it; rates are 1e18-scaled raw-unit rates;
// APYs are fractions (0.081 is 8.1%).

export interface PendleToken {
  /** Lowercased. */
  address: string;
  symbol: string | null;
  decimals: number | null;
}

export interface PendleMarketTokens {
  market: PendleToken;
  sy: PendleToken;
  pt: PendleToken;
  yt: PendleToken;
  yieldToken: PendleToken;
  asset: PendleToken & { type: "token" | "liquidity" | number; syDecimals: number };
  /** Unix seconds. */
  expiry: number;
}

export type PendleMarkSource = "oracle-twap" | "routerstatic-spot";

export interface PendleMarks {
  source: PendleMarkSource | null;
  twapSeconds: number;
  oracle: {
    increaseCardinalityRequired: boolean;
    cardinalityRequired: number;
    oldestObservationSatisfied: boolean;
    ready: boolean;
  } | null;
  ptToSy: string | null;
  ytToSy: string | null;
  lpToSy: string | null;
  syToAsset: string | null;
  ptToAsset: string | null;
  ytToAsset: string | null;
  lpToAsset: string | null;
}

export type PendleLeg = "pt" | "yt" | "lp";

export interface PendleBoundary {
  kind: "unrouted-in" | "unrouted-out";
  market: string;
  leg: PendleLeg;
  token: string;
  amount: string;
  balance: string;
  routerNet: string;
  lastRouterBlock: number | null;
  block: number;
}

export interface PendleReward {
  token: string;
  symbol: string | null;
  decimals: number | null;
  amount: string;
}

export interface PendleLegValues {
  pt: string | null;
  yt: string | null;
  lp: string | null;
  interest: string | null;
  total: string | null;
}

export interface PendleTotals {
  in: string;
  out: string;
  net: string;
}

export interface PendleFlows {
  pt: PendleTotals;
  yt: PendleTotals;
  lp: PendleTotals;
  sy: PendleTotals;
  tokens: Record<string, PendleTotals>;
  syEquivalent: PendleTotals;
  asset: PendleTotals | null;
  events: number;
  firstBlock: number | null;
  lastBlock: number | null;
}

export interface PendleMaturity {
  expiry: number;
  expired: boolean | null;
  secondsToExpiry: number;
  pt: { assetAtExpiry: string | null; redeemableNow: boolean };
  yt: { valueAsset: string | null; interestAsset: string | null; claimable: boolean };
  lp: { removable: true; swapsOpen: boolean };
}

export interface PendlePosition {
  tokens: PendleMarketTokens;
  balances: { pt: string | null; yt: string | null; lp: string | null };
  lpSplit: { pt: string | null; sy: string | null };
  ytInterest: { sy: string | null; asset: string | null };
  rewards: { yt: PendleReward[]; lp: PendleReward[] };
  marks: PendleMarks;
  value: { sy: PendleLegValues; asset: PendleLegValues };
  apy: {
    current: number | null;
    entry: {
      ptWeighted: number | null;
      ptBought: string;
      assetPaid: string;
      assetPerPt: string | null;
      buys: number;
      unpriced: number;
    };
  };
  maturity: PendleMaturity;
  flows: PendleFlows;
  boundaries: PendleBoundary[];
}

export type PendleEventKind =
  | "add-liquidity"
  | "remove-liquidity"
  | "buy-pt"
  | "sell-pt"
  | "buy-yt"
  | "sell-yt"
  | "swap-pt-yt"
  | "mint-py"
  | "redeem-py"
  | "mint-sy"
  | "redeem-sy"
  | "exit"
  | "limit-fill";

export type PendleRole = "caller" | "receiver" | "both" | "router-hop" | "maker" | "taker";

export interface PendleEventLeg {
  leg: "pt" | "yt" | "lp" | "sy" | "token";
  token: string | null;
  amount: string;
}

export interface PendleTimelineRow {
  block: number;
  timestamp: number;
  txHash: string;
  txIndex: number;
  logIndex: number;
  router: "v4" | "v3" | "limit";
  event: string;
  kind: PendleEventKind;
  role: PendleRole;
  market: string | null;
  legs: PendleEventLeg[];
  syEquivalent: string | null;
  syToAsset: string | null;
  asset: string | null;
  impliedApy: number | null;
  partial: boolean;
}

export interface PendleProvenance {
  chain: string;
  routerEvents: string;
  routerThroughBlock: number | null;
  routerStatic: string;
  oracle: string;
}

export interface PendleTokenMeta {
  symbol: string | null;
  decimals: number | null;
}

export interface PendleWalletPositions {
  chainId: 1;
  wallet: string;
  block: number;
  timestamp: number;
  positions: PendlePosition[];
  timeline: PendleTimelineRow[];
  coverage: { fromBlock: number; toBlock: number } | null;
  unplacedYts: string[];
  notMarkets: string[];
  truncated: boolean;
  tokens: Record<string, PendleTokenMeta>;
  provenance: PendleProvenance;
}

export interface PendleMarketSeen {
  market: string;
  events: number;
  firstBlock: number;
  lastBlock: number;
}

export interface PendleMarketLive {
  marks: PendleMarks;
  expired: boolean | null;
  state: {
    totalPt: string;
    totalSy: string;
    totalLp: string;
    lastLnImpliedRate: string;
    reserveFeePercent: string;
    lnFeeRateRoot: string;
  } | null;
  impliedApy: number | null;
  lpSupply: string | null;
  tvl: { sy: string; asset: string | null } | null;
  rewardTokens: string[];
}

export interface PendleMarketEvent {
  block: number;
  timestamp: number;
  txHash: string;
  txIndex: number;
  logIndex: number;
  router: "v4" | "v3" | "limit";
  event: string;
  kind: PendleEventKind;
  market: string;
  caller: string | null;
  receiver: string | null;
  legs: PendleEventLeg[];
  syEquivalent: string | null;
}

export interface PendleMarketPage {
  chainId: 1;
  block: number;
  timestamp: number;
  tokens: PendleMarketTokens;
  live: PendleMarketLive;
  rewardTokens: Record<string, PendleTokenMeta>;
  router: PendleMarketSeen | null;
  recent: PendleMarketEvent[];
  /** The cursor of the next page of router events ("block-txIndex-logIndex"); null on the last. */
  next: string | null;
  provenance: PendleProvenance;
}

export interface PendleRosterEntry {
  tokens: PendleMarketTokens;
  router: PendleMarketSeen;
  expired: boolean | null;
  impliedApy: number | null;
  tvl: { sy: string; asset: string | null } | null;
  ptToSy: string | null;
  syToAsset: string | null;
}

export interface PendleRoster {
  chainId: 1;
  block: number;
  markets: PendleRosterEntry[];
  notMarkets: string[];
  provenance: PendleProvenance;
}
