/**
 * Utility functions for liquidation display and calculations
 */

import type { TroveLiquidationTransaction } from "@/types/api/troveHistory";

/**
 * Get the liquidation threshold (MCR - Minimum Collateral Ratio) for a given collateral type
 * @param collateralType The type of collateral (e.g., "WETH", "wstETH", etc.)
 * @returns The MCR as a percentage (e.g., 110 for WETH, 120 for others)
 */
export function getLiquidationThreshold(collateralType: string): number {
  const isETH = collateralType === "WETH" || collateralType === "ETH";
  return isETH ? 110 : 120;
}

/**
 * The collateral price at which a trove hits its branch's minimum collateral
 * ratio (MCR) and can be liquidated. Liquity V2's ICR uses the trove's ENTIRE
 * debt (recorded principal + accrued interest + redistribution), so callers
 * must pass the entire debt — a recorded-debt basis understates the
 * liquidation price and overstates headroom.
 * @returns The price, or null when either operand is non-positive.
 */
export function troveLiquidationPrice({
  debt,
  collateral,
  collateralType,
}: {
  /** The trove's ENTIRE debt (recorded + accrued interest + redistribution). */
  debt: number;
  /** The trove's entire collateral balance. */
  collateral: number;
  collateralType: string;
}): number | null {
  if (!(debt > 0) || !(collateral > 0)) return null;
  return (debt * (getLiquidationThreshold(collateralType) / 100)) / collateral;
}

/**
 * Magnitude-aware formatter for a liquidation price — liq prices vary widely
 * (BTC ~$100k, USDC ~$1), so neither "$100,000.00" nor "$0" should render.
 * Shared by the card's "Liquidates at" caption and the Explanation pane's
 * runway bullet so the two surfaces state the same figure identically.
 */
export function formatLiquidationPrice(p: number): string {
  if (p < 0.01) return "< $0.01";
  if (p < 1) return "$" + p.toFixed(3);
  if (p < 100) return "$" + p.toFixed(2);
  if (p < 1_000) return "$" + p.toFixed(0);
  if (p < 1_000_000) return "$" + (p / 1000).toFixed(p < 10_000 ? 2 : 1) + "K";
  return "$" + (p / 1_000_000).toFixed(2) + "M";
}

/**
 * Detect if this was a batch liquidation by comparing per-trove vs system totals
 */
function detectBatchLiquidation(tx: TroveLiquidationTransaction): boolean {
  const perTroveDebt = Math.abs(tx.troveOperation.debtChangeFromOperation);
  const systemTotalDebt = tx.systemLiquidation.debtOffsetBySP + tx.systemLiquidation.debtRedistributed;

  const perTroveColl = Math.abs(tx.troveOperation.collChangeFromOperation);
  const systemTotalColl =
    tx.systemLiquidation.collSentToSP +
    tx.systemLiquidation.collRedistributed +
    tx.systemLiquidation.collSurplus +
    tx.systemLiquidation.collGasCompensation;

  // If system totals are more than 5% larger than per-trove values, likely a batch
  const debtRatio = systemTotalDebt / perTroveDebt;
  const collRatio = systemTotalColl / perTroveColl;

  // Allow small variance for rounding, but flag if >5% difference
  return debtRatio > 1.05 || collRatio > 1.05;
}

/**
 * Calculate gas compensation for a liquidation
 * Formula: min(0.5% of collateral, 2 units) + 0.0375 WETH
 * Note: The 0.0375 WETH is in native ETH, not counted in collateral amounts
 */
function calculateGasCompensation(totalCollateral: number): number {
  // Variable gas compensation: 0.5% of collateral, capped at 2 units
  const variableGasComp = Math.min(totalCollateral * 0.005, 2);

  // Note: Fixed 0.0375 WETH is not included in collateral distribution
  return variableGasComp;
}

/**
 * Calculate surplus for this specific trove
 * Formula: initial_coll - (debt * 1.05 / price) - gas_compensation
 */
function calculateSurplusForThisTrove(collLiquidated: number, debtCleared: number, liquidationPrice: number): number {
  // Collateral needed to cover debt + 5% penalty
  const collNeededForDebt = (debtCleared * 1.05) / liquidationPrice;

  // Gas compensation taken
  const gasComp = calculateGasCompensation(collLiquidated);

  // Surplus = what's left over
  const surplus = Math.max(0, collLiquidated - collNeededForDebt - gasComp);

  return surplus;
}
