// ============================================================================
// FETCH SPARK POSITION (chain state)
// ============================================================================
//
// Per-wallet pooled-account state read directly from the SparkLend Pool — the
// near-clone of lib/api/fetch-aave-v3-position.ts (SparkLend is an Aave V3 fork:
// same getUserAccountData 6-tuple, same 8-decimal-USD base currency, verified by
// scripts/verify-spark-fork-deltas.mjs). One cross-collateralised account per
// wallet, single mainnet Pool — no market axis. Returns aggregate HF + the
// oracle-priced USD totals `getUserAccountData` reports, plus per-reserve
// balances and reserve economics at the live head.
//
// Balances are TEXT to preserve numeric(78,0) precision; scale by `decimals`.

export interface SparkChainReserve {
  address: string; // underlying token, lowercase
  symbol: string;
  decimals: number;
  /** Token wei (raw integer string). Scale by 10^decimals for display. */
  supplyBalanceRaw: string;
  /** Token wei (raw integer string). */
  debtBalanceRaw: string;
  isCollateral: boolean;
  hasBorrow: boolean;
  /** Liquidation threshold (0..1) — chain-read from the reserve configuration at
   *  head (falls back to the curated catalog LT, then null). */
  lt: number | null;
  // ── Reserve economics, read from getReserveData @ head (0..1 fractions) ──
  /** Supply APR (currentLiquidityRate, ray → fraction). */
  supplyApr?: number;
  /** Variable borrow APR (currentVariableBorrowRate, ray → fraction). */
  borrowApr?: number;
  /** Reserve factor — the protocol's cut of borrow interest (config bits 64-79). */
  reserveFactor?: number;
  /** Reserve utilization = total variable debt ÷ total supplied. */
  utilization?: number;
}

export interface SparkPositionChainResponse {
  wallet: string;
  pool: string;
  blockNumber: number;
  /** 1.0-scaled HF. Null when no debt. */
  healthFactor: number | null;
  /** Aggregate current liquidation threshold (0..1) from getUserAccountData. */
  avgLiquidationThreshold: number;
  /** Aggregate current loan-to-value (0..1). */
  ltv: number;
  /** Oracle-priced USD totals from getUserAccountData (8-dec base currency). */
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableBorrowsUsd: number;
  supplyAssetCount: number;
  debtAssetCount: number;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
  /** Reserves with non-zero supply or debt. */
  reserves: SparkChainReserve[];
}

export interface FetchSparkPositionParams {
  wallet: string;
  baseUrl?: string;
}

export async function fetchSparkPosition(p: FetchSparkPositionParams): Promise<SparkPositionChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  const url = `${p.baseUrl ?? ""}/api/chain/spark/position?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchSparkPosition failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as SparkPositionChainResponse;
}

/** On-chain oracle USD for arbitrary reserve addresses (IAaveOracle
 *  getAssetPrice @ head) — prices the exited/liquidated reserves the listing
 *  row's priceByAddress (current reserves only) omits, so the economics tower
 *  can value lifetime flows. An unpriceable asset is simply absent. */
export async function fetchSparkOraclePrices(assets: string[], baseUrl?: string): Promise<Record<string, number>> {
  if (assets.length === 0) return {};
  const url = `${baseUrl ?? ""}/api/chain/spark/oracle-prices?assets=${assets.join(",")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchSparkOraclePrices failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { prices?: Record<string, number> };
  return data.prices ?? {};
}

/** Scale a raw balance string by token decimals into a display Number (BigInt-safe,
 *  ES2017). */
export function scaleSparkChainBalance(raw: string, decimals: number): number {
  if (!raw || raw === "0") return 0;
  let big: bigint;
  try {
    big = BigInt(raw);
  } catch {
    return 0;
  }
  if (big === BigInt(0)) return 0;
  if (decimals <= 0) return Number(big);
  const divisor = BigInt("1" + "0".repeat(decimals));
  return Number(big / divisor) + Number(big % divisor) / Number(divisor);
}
