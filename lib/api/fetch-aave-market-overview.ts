// ============================================================================
// FETCH AAVE-FAMILY MARKET OVERVIEW (Aave V3 Core / SparkLend)
// ============================================================================
//
// The protocol-aggregate view of one Aave-V3-architecture market: every reserve
// on the Pool with its size, rates, risk params and the market's own oracle
// price — read LIVE from the chain (Pool.getReservesList → getReserveData +
// IAaveOracle.getAssetPrice, one multicall burst; lib/sources/chain/
// aave-market-overview.ts). Feeds the shared market-overview surface at
// /aave-v3/market and /spark/market — the V3-family counterpart of Aave V4's
// /aave-v4/hubs comparison (single market, so one summary card, not a band).
//
// Amounts arrive as token-unit numbers (BigInt-safe scaled server-side), USD is
// priced by the market's own IAaveOracle — chain-derived, so it survives the
// on-chain-only gate. There is no second source to reconcile: this IS the
// Pool's own statement of its reserves at the named block.

export interface AaveMarketReserve {
  /** Lowercased underlying token address. */
  address: string;
  symbol: string;
  decimals: number;
  /** Total supplied (aToken totalSupply), token units. */
  supplied: number;
  /** Total variable debt (variableDebtToken totalSupply), token units. */
  borrowed: number;
  /** USD per whole token from the market's own IAaveOracle; null if unpriced. */
  priceUsd: number | null;
  /** Liquidation threshold (0..1) from the live reserve config; null when 0.
   *  Zero does NOT mean "can never be collateral" — see `emodeCategories`: a
   *  reserve the Pool weights at zero on its own can still be collateral at a
   *  real threshold inside an efficiency-mode category. */
  lt: number | null;
  /** The efficiency-mode categories that count this reserve as collateral, each
   *  with the liquidation threshold that then applies IN PLACE of `lt`. Which
   *  one a given wallet gets is its own choice (`getUserEMode`), so a market
   *  table can only list them; a position card resolves to one. Empty when the
   *  Pool's categories do not include this reserve. */
  emodeCategories?: { id: number; label: string; lt: number; ltv?: number }[];
  /** Max loan-to-value (0..1) from the live reserve config; null when 0. */
  ltv: number | null;
  /** Supply / variable-borrow APR as decimal fractions (0.05 = 5%). */
  supplyApr: number;
  borrowApr: number;
  /** Protocol's share of borrow interest (0..1). */
  reserveFactor: number;
  /** Pool utilisation = total variable debt ÷ total supplied; null when
   *  nothing is supplied (e.g. GHO, which is minted, not supplied). */
  utilization: number | null;
  /** Live caps in whole tokens; null = uncapped (config 0). Two values are
   *  sentinels rather than sizes: 1 whole token is how governance closes a
   *  side, and 2^36 − 1 (the field's largest value, SparkLend's choice) means
   *  no cap. lib/shared/aave-market-view.ts reads them. */
  supplyCap: number | null;
  borrowCap: number | null;
  /** SparkLend only: the CapAutomator's maximum for each side, whole tokens;
   *  null where the automator manages nothing for this reserve. */
  supplyCapMax?: number | null;
  borrowCapMax?: number | null;
  /** The treasury's share not yet minted as aTokens, token units. The Pool's
   *  supply-cap check adds it to the aToken supply. */
  accruedToTreasury?: number;
  /** Liquidation bonus as the extra fraction a liquidator receives (0.05 =
   *  5%); null when the reserve carries none. */
  liquidationBonus?: number | null;
  /** The config word's integer fields as the Pool stores them, basis points:
   *  loan-to-value, liquidation threshold, liquidation bonus (10000 + extra). */
  bps?: { ltv: number; lt: number; bonus: number };
  /** Siloed borrowing: a wallet borrowing this reserve can borrow nothing else. */
  siloed?: boolean;
  /** Isolation-mode debt ceiling in USD; null when the reserve is not isolated. */
  debtCeiling?: number | null;
  /** The reserve's interest-rate strategy contract (lowercased). */
  rateStrategy?: string;
  /** The rate model's kink (0..1) — the utilisation where the borrow curve
   *  turns steep; null when the strategy answers neither getter. */
  kink?: number | null;
  /** The strategy's ray-scaled answer, untouched, and which getter gave it. */
  kinkRaw?: string | null;
  kinkMethod?: "getOptimalUsageRatio" | "OPTIMAL_USAGE_RATIO" | null;
  /** Live reserve-config flags. */
  borrowEnabled: boolean;
  frozen: boolean;
  paused: boolean;
}

export interface AaveMarketOverviewResponse {
  pool: string;
  oracle: string;
  blockNumber: number;
  /** True when the RPC read failed — reserves is empty, show a retry state. */
  chainStale: boolean;
  /** SparkLend's CapAutomator, when the market has one. */
  capAutomator?: string;
  reserves: AaveMarketReserve[];
}

/** Fetch one market's live overview through this deployment's own chain proxy
 *  (`/api/chain/aave-v3/market` or `/api/chain/spark/market`). */
export async function fetchAaveMarketOverview(route: string): Promise<AaveMarketOverviewResponse> {
  const res = await fetch(route, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`fetchAaveMarketOverview failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AaveMarketOverviewResponse;
}
