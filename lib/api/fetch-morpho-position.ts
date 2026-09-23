// ============================================================================
// FETCH MORPHO LIVE CHAIN POSITION
// ============================================================================
//
// Client for /api/chain/morpho/position — the per-(market, user) verification
// lane reading Morpho Blue's own slots at head: position() and market()
// (live-accrued via the IRM's borrowRateView + the contract's Taylor
// compounding), the market's own oracle price, and the health arithmetic that
// REPLICATES the internal _isHealthy (Morpho exposes no public verdict getter
// — the replica is verified against chain behaviour by
// scripts/verify-morpho-chain.mjs).
//
// Every derived value is in LOAN-TOKEN units — a Morpho oracle quotes the
// collateral asset in loan-asset terms (1e36-scaled), never USD.

/** One feed behind a Morpho oracle's price, read at the position's block. */
export interface MorphoOracleFeed {
  /** The oracle getter that names it. */
  slot: "BASE_FEED_1" | "BASE_FEED_2" | "QUOTE_FEED_1" | "QUOTE_FEED_2";
  address: string;
  /** The feed's own description() ("Coinbase AAPL"); null where it has none. */
  description: string | null;
  /** latestRoundData() — round id and answer as raw integer strings. */
  roundId: string;
  answer: string;
  decimals: number | null;
  /** Unix seconds the answer was published. */
  updatedAt: number;
}

export interface MorphoChainPositionResponse {
  positionId: string;
  /** 0x-prefixed market id (keccak of the params). */
  marketId: string;
  user: string;
  blockNumber: number;
  /** Head block unix seconds — the accrual anchor. */
  timestamp: number;

  loanToken: string;
  loanSymbol: string;
  loanDecimals: number;
  collateralToken: string;
  collateralSymbol: string;
  collateralDecimals: number;
  oracle: string;
  irm: string;
  /** Liquidation LTV as a 0..1 fraction. */
  lltv: number;

  /** position() slots, raw integer strings. */
  collateralRaw: string;
  borrowSharesRaw: string;
  supplySharesRaw: string;
  /** market() borrow totals AFTER the view accrual (raw integer strings). */
  totalBorrowAssetsRaw: string;
  totalBorrowSharesRaw: string;
  /** market() supply totals after the same accrual — including the fee shares
   *  _accrueInterest mints to the fee recipient, which dilute every lender. */
  totalSupplyAssetsRaw: string;
  totalSupplySharesRaw: string;
  /** What this wallet's supply shares are worth in loan tokens right now
   *  (toAssetsDown over the accrued totals — rounded down, as Morpho rounds a
   *  lender's claim). Zero for a pure borrower. */
  currentSupply: number;
  /** Seconds between the market's lastUpdate and head. */
  sinceUpdate: number;

  /** 1 whole collateral token in whole loan tokens (the market's own oracle). */
  oraclePrice: number;
  /** The feeds the oracle names (a MorphoChainlinkOracleV2's four feed
   *  getters, zero ones skipped), each as its latestRoundData() answered at
   *  `blockNumber`. Null when the oracle names none, is not that kind (the
   *  getters revert — a hand-set oracle), or any feed gave no time: the page
   *  then states nothing about the price's age. */
  oracleFeeds: MorphoOracleFeed[] | null;
  /** The OLDEST feed's updatedAt (unix seconds) — the price is as old as its
   *  oldest input. Null exactly when `oracleFeeds` is. */
  oraclePublishedAt: number | null;
  /** Human collateral (collateral tokens). */
  collateral: number;
  /** Collateral valued in loan tokens (collateral × oraclePrice). */
  collateralValue: number;
  /** Live debt WITH interest (loan tokens) — toAssetsUp over accrued totals. */
  currentDebt: number;
  /** Liquidation capacity in loan tokens = collateralValue × lltv. */
  maxBorrow: number;
  /** currentDebt ÷ collateralValue; null without debt or price. */
  ltv: number | null;
  /** maxBorrow ÷ currentDebt; null without debt or price. */
  healthFactor: number | null;
  /** The _isHealthy replica's verdict (BigInt-exact); null without debt. */
  healthy: boolean | null;

  utilization: number;
  borrowApr: number;
  supplyApr: number;
  /** Market fee as a 0..1 fraction of interest. */
  fee: number;
  /** Liquidation incentive factor, e.g. 1.0438 → 4.38% collateral penalty. */
  lif: number;

  /** True when the RPC read failed — values are a stub; risk surfaces stay off. */
  chainStale: boolean;
}

export async function fetchMorphoPosition(p: {
  market: string;
  user: string;
  baseUrl?: string;
}): Promise<MorphoChainPositionResponse> {
  const qs = new URLSearchParams({ market: p.market, user: p.user });
  const res = await fetch(`${p.baseUrl ?? ""}/api/chain/morpho/position?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchMorphoPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as MorphoChainPositionResponse;
}
