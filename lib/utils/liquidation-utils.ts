/**
 * Utility functions for liquidation display and calculations
 */

import { TroveLiquidationTransaction } from "@/types/api/troveHistory";

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
 * Get the maximum LTV (Loan-to-Value) for a given collateral type
 * @param collateralType The type of collateral
 * @returns The max LTV as a percentage string (e.g., "90.91%" for WETH)
 */
export function getMaxLTV(collateralType: string): string {
  const isETH = collateralType === "WETH" || collateralType === "ETH";
  return isETH ? "90.91%" : "83.33%";
}

/**
 * Get the liquidation URL for claiming surplus on liquity.app
 * @param troveId The trove ID
 * @param collateralType The collateral type
 * @returns The URL to claim surplus on liquity.app
 */
export function getLiquidationClaimUrl(troveId: string, collateralType: string): string {
  // TODO: Confirm correct URL structure with frontend team
  return `https://liquity.app`;
}

/**
 * Calculate accurate per-trove liquidation data
 * Uses troveOperation (per-trove) data instead of systemLiquidation (aggregate) data
 *
 * @param tx The liquidation transaction
 * @returns Accurate per-trove liquidation values
 */
export function getPerTroveLiquidationData(tx: TroveLiquidationTransaction) {
  // ✅ ACCURATE: Use per-trove data from TroveOperation event
  const collLiquidated = Math.abs(tx.troveOperation.collChangeFromOperation);
  const debtCleared = Math.abs(tx.troveOperation.debtChangeFromOperation);

  const liquidationPrice = tx.systemLiquidation.price;
  const totalCollValueAtLiquidation = collLiquidated * liquidationPrice;
  const totalDebtValueAtLiquidation = debtCleared;

  // Detect if this was a batch liquidation
  const isBatchLiquidation = detectBatchLiquidation(tx);

  // Calculate collateral distribution
  // In single-trove liquidations, systemLiquidation values match this trove
  // In batch liquidations, we need to calculate based on per-trove data

  // For surplus: use systemLiquidation if single trove, otherwise calculate
  const collSurplus = isBatchLiquidation
    ? calculateSurplusForThisTrove(collLiquidated, debtCleared, liquidationPrice)
    : tx.systemLiquidation.collSurplus;

  // For collateral sent to SP and gas compensation, calculate from known values
  const collGasCompensation = calculateGasCompensation(collLiquidated);
  const collToSP = collLiquidated - collSurplus - collGasCompensation;

  // Calculate liquidation penalty (5% of debt value in collateral)
  const penaltyInCollateral = (debtCleared * 0.05) / liquidationPrice;
  const penaltyValueUsd = penaltyInCollateral * liquidationPrice;

  // Calculate collateral ratio at liquidation
  const crAtLiquidation = (totalCollValueAtLiquidation / debtCleared) * 100;

  // Determine liquidation mechanism
  const debtOffsetBySP = tx.systemLiquidation.debtOffsetBySP;
  const debtRedistributed = tx.systemLiquidation.debtRedistributed;

  const wasFullyAbsorbedBySP = debtOffsetBySP > 0 && debtRedistributed === 0;
  const wasFullyRedistributed = debtRedistributed > 0 && debtOffsetBySP === 0;
  const wasPartiallyRedistributed = debtOffsetBySP > 0 && debtRedistributed > 0;

  return {
    // Per-trove accurate values
    collLiquidated,
    debtCleared,
    collToSP,
    collSurplus,
    collGasCompensation,

    // USD values
    totalCollValueAtLiquidation,
    collSurplusValueUsd: collSurplus * liquidationPrice,
    collToSPValueUsd: collToSP * liquidationPrice,
    penaltyValueUsd,
    penaltyInCollateral,

    // Calculated metrics
    crAtLiquidation,
    liquidationPrice,

    // Metadata
    isBatchLiquidation,
    surplusIsAmbiguous: isBatchLiquidation && tx.systemLiquidation.collSurplus > 0,

    // Mechanism used - detailed breakdown
    wasRedistributed: debtRedistributed > 0,
    wasFullyAbsorbedBySP,
    wasFullyRedistributed,
    wasPartiallyRedistributed,
  };
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
function calculateSurplusForThisTrove(
  collLiquidated: number,
  debtCleared: number,
  liquidationPrice: number
): number {
  // Collateral needed to cover debt + 5% penalty
  const collNeededForDebt = (debtCleared * 1.05) / liquidationPrice;

  // Gas compensation taken
  const gasComp = calculateGasCompensation(collLiquidated);

  // Surplus = what's left over
  const surplus = Math.max(0, collLiquidated - collNeededForDebt - gasComp);

  return surplus;
}
