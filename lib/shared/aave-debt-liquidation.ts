/**
 * The borrowed asset's price at liquidation for an Aave-family account whose
 * debt is one non-stable asset: the price at which the health factor reaches
 * 1.0 with every collateral price held where it is.
 *
 * The health factor is the collateral's threshold-weighted value over the
 * debt's, so with the collateral fixed the debt can grow to `hf` times its
 * value. Where other debt is left at its own price, the one asset takes the
 * whole of that room: `(hf × debt − other) / asset`. An asset that holds at
 * least 99.5% of the debt counts as the debt (the collateral read's rule,
 * lib/aave-v3/chain-truth-tower.ts `aaveV3LiquidationRead`).
 *
 * Pure and import-free, so the unit tests run it as it stands.
 */

export interface AaveDebtReserve {
  symbol: string;
  amount: number;
  /** The Pool's oracle price in USD; null where unpriced. */
  price: number | null;
  /** A stable-denominated asset (lib/aave-v4/asset-class.ts). */
  stable: boolean;
}

export interface AaveDebtLiquidation {
  symbol: string;
  price: number;
  liqPrice: number;
  /** The rise from `price` to `liqPrice`, in percent. */
  risePct: number;
}

/** Null where the read does not apply: no health factor in (1, 100), an
 *  unpriced debt, a debt spread over several assets, or a stable debt. */
export function aaveDebtLiquidation(
  hf: number | null | undefined,
  debts: readonly AaveDebtReserve[],
): AaveDebtLiquidation | null {
  if (hf == null || hf <= 1 || hf >= 100) return null;
  const live = debts.filter((d) => d.amount > 0);
  if (live.length === 0 || live.some((d) => d.price == null || d.price <= 0)) return null;
  const valued = live.map((d) => ({ d, usd: d.amount * (d.price as number) }));
  const total = valued.reduce((s, v) => s + v.usd, 0);
  const top = valued.reduce((a, b) => (b.usd > a.usd ? b : a));
  if (total <= 0 || top.usd / total < 0.995 || top.d.stable) return null;
  const price = top.d.price as number;
  const liqPrice = (price * (hf * total - (total - top.usd))) / top.usd;
  return { symbol: top.d.symbol, price, liqPrice, risePct: (liqPrice / price - 1) * 100 };
}
