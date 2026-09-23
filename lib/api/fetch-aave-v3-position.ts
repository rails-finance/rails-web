// ============================================================================
// FETCH AAVE V3 POSITION (chain state)
// ============================================================================
//
// Per-wallet pooled-account state read directly from one market's V3 Pool. Aave
// V3 is one cross-collateralised account per (wallet, market) — Core / Prime /
// EtherFi are separate Pools — so the read takes the wallet plus the market key.
// Returns the numbers Aave's own UI renders: aggregate HF + per-reserve
// supply/debt balances in raw token wei, plus the oracle-priced USD totals
// `getUserAccountData` reports (V3's base currency is 8-decimal USD, so these are
// real even without a local price table — pinned to the same block T as
// everything else).
//
// Balances are TEXT to preserve numeric(78,0) precision; scale by `decimals`.

export interface AaveV3ChainReserve {
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
   *  T (falls back to the curated catalog LT, then null). */
  lt: number | null;
  // ── Reserve economics, read from getReserveData @ T (all 0..1 fractions) ──
  /** Supply APR (currentLiquidityRate, ray → fraction). */
  supplyApr?: number;
  /** Variable borrow APR (currentVariableBorrowRate, ray → fraction). */
  borrowApr?: number;
  /** Reserve factor — the protocol's cut of borrow interest (config bits 64-79). */
  reserveFactor?: number;
  /** Reserve utilization = total variable debt ÷ total supplied. */
  utilization?: number;
  /** True when the wallet's active eMode category counts THIS reserve as
   *  collateral — in which case the CATEGORY's liquidation threshold is the one
   *  the Pool judges the reserve by, not the reserve's own `lt` above.
   *
   *  Resolved server-side because the two eMode generations answer it from
   *  different places: a pre-3.2 Pool names one category per reserve in the
   *  reserve's own config word, while a liquid-eMode Pool (V3.2+) keeps a
   *  bitmap of member reserves per category and leaves that config field
   *  stale — on Aave V3 Base it disagrees with the bitmaps on 8 of 15 reserves.
   *  The client needs the verdict, not the mechanism. Absent when the wallet is
   *  in no category, where `lt` stands on its own. */
  emodeCollateral?: boolean;
}

/** The wallet's own eMode category, read from the Pool for every V3-family
 *  deployment (both eMode generations — the reader resolves which one this Pool
 *  speaks). Null when the wallet is in no category. */
export interface AaveV3EMode {
  id: number;
  label: string;
  /** Category liquidation threshold (0..1) — this REPLACES the reserve's own
   *  for every reserve the category counts as collateral (`emodeCollateral`),
   *  which is why a card that prints the reserve LT alone is wrong for an eMode
   *  wallet. Reserves outside the category keep their own threshold. */
  lt: number;
  /** Category max loan-to-value (0..1). */
  ltv: number;
}

export interface AaveV3PositionChainResponse {
  wallet: string;
  /** The market's Pool address (lowercase) every figure was read from. */
  pool: string;
  /** Market key (core | prime | etherfi) — echoed by the route. */
  market?: string;
  blockNumber: number;
  /** 1.0-scaled HF. Null when no debt. */
  healthFactor: number | null;
  /** Aggregate current liquidation threshold (0..1) from getUserAccountData —
   *  V3's analog of V4's avgCollateralFactor. */
  avgLiquidationThreshold: number;
  /** Aggregate current loan-to-value (0..1). */
  ltv: number;
  /** Oracle-priced USD totals from getUserAccountData (8-dec base currency at T).
   *  Real even without a local price table. */
  totalCollateralUsd: number;
  totalDebtUsd: number;
  availableBorrowsUsd: number;
  supplyAssetCount: number;
  debtAssetCount: number;
  /** The wallet's eMode category at T. Null when the wallet is in none. */
  emode?: AaveV3EMode | null;
  /** True when the chain RPC read failed and we returned an empty stub. */
  chainStale: boolean;
  /** Reserves with non-zero supply or debt. */
  reserves: AaveV3ChainReserve[];
}

export interface FetchAaveV3PositionParams {
  wallet: string;
  /** core | prime | etherfi (default core). Ethereum only — Base has one Pool,
   *  so its route takes no market and ignores this. */
  market?: string;
  baseUrl?: string;
  /** Which deployment's chain proxy to ask. Defaults to Ethereum's; the Base
   *  explorer passes `/api/chain/aave-v3-base/position`. The response shape is
   *  identical — it is the same reader behind both routes. */
  route?: string;
}

export async function fetchAaveV3Position(p: FetchAaveV3PositionParams): Promise<AaveV3PositionChainResponse> {
  const qs = new URLSearchParams({ wallet: p.wallet });
  if (p.market) qs.set("market", p.market);
  const url = `${p.baseUrl ?? ""}${p.route ?? "/api/chain/aave-v3/position"}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchAaveV3Position failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as AaveV3PositionChainResponse;
}

/** On-chain oracle USD for arbitrary reserve addresses (IAaveOracle
 *  getAssetPrice @ head) — prices the exited/liquidated reserves the listing
 *  row's priceByAddress (current reserves only) omits, so the economics tower
 *  can value lifetime flows. An unpriceable asset is simply absent. */
export async function fetchAaveV3OraclePrices(assets: string[], baseUrl?: string): Promise<Record<string, number>> {
  if (assets.length === 0) return {};
  const url = `${baseUrl ?? ""}/api/chain/aave-v3/oracle-prices?assets=${assets.join(",")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`fetchAaveV3OraclePrices failed: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { prices?: Record<string, number> };
  return data.prices ?? {};
}

/** Scale a raw balance string by token decimals into a display Number (BigInt-safe,
 *  ES2017). */
export function scaleV3ChainBalance(raw: string, decimals: number): number {
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
