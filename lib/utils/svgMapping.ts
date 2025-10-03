import { TransactionImageKey } from "./transactionImages";

// Asset icon mapping - centralized to avoid duplication
export function getAssetIconId(asset: string): string {
  switch (asset.toLowerCase()) {
    case "bold":
      return "icon-bold";
    case "eth":
    case "weth":
      return "icon-eth";
    case "reth":
      return "icon-reth";
    case "wsteth":
      return "icon-wsteth";
    default:
      return "icon-default";
  }
}

// Central mapping from transaction image keys to actual SVG file paths
// This is the single source of truth for SVG file locations
// Only includes operations that have corresponding SVG files
export const SVG_FILE_MAPPING: Record<TransactionImageKey, string> = {
  // Basic operations
  openTrove: "openTrove_depositAndBorrow.svg",
  closeTrove: "closeTrove_repayAndWithdraw.svg",

  // AdjustTrove variations - exact matches exist
  adjustTrove_borrowAndDeposit: "adjustTrove_borrowAndDeposit.svg",
  adjustTrove_repayAndWithdraw: "adjustTrove_repayAndWithdraw.svg",
  adjustTrove_repayAndDeposit: "adjustTrove_repayAndDeposit.svg",
  adjustTrove_borrowAndWithdraw: "adjustTrove_borrowAndWithdraw.svg",
  adjustTrove_borrowOnly: "adjustTrove_borrowOnly.svg",
  adjustTrove_repayOnly: "adjustTrove_repayOnly.svg",
  adjustTrove_depositOnly: "adjustTrove_depositOnly.svg",
  adjustTrove_withdrawOnly: "adjustTrove_withdrawOnly.svg",

  // CloseTrove variations - based on whether debt is repaid
  closeTrove_repayAndWithdraw: "closeTrove_repayAndWithdraw.svg",
  closeTrove_withdrawOnly: "closeTrove_withdrawOnly.svg",

  // Interest rate adjustments - exact matches exist
  adjustTroveInterestRate_increase: "adjustTroveInterestRate_increase.svg",
  adjustTroveInterestRate_decrease: "adjustTroveInterestRate_decrease.svg",
  adjustTroveInterestRate_increase_delegated: "adjustTroveInterestRate_increase_delegated.svg",
  adjustTroveInterestRate_decrease_delegated: "adjustTroveInterestRate_decrease_delegated.svg",

  // Apply pending debt operations - dedicated SVGs
  applyPendingDebt_single: "applyPendingDebt_single.svg",
  applyPendingDebt_combined: "applyPendingDebt_combined.svg",

  // Liquidations - exact matches exist
  liquidate_beneficial: "liquidate_beneficial.svg",
  liquidate_harmful: "liquidate_harmful.svg",

  // Other operations - exact matches exist
  redeemCollateral: "redeemCollateral.svg",
  openTroveAndJoinBatch: "openTroveAndJoinBatch_depositAndBorrow.svg",
  setInterestBatchManager: "setInterestBatchManager.svg",
  removeFromBatch: "removeFromBatch.svg",
  transferTrove: "transferTrove.svg",

  // Batch operations
  joinBatch: "joinBatch.svg",
  exitBatch: "removeFromBatch.svg", // exitBatch uses removeFromBatch SVG

  // Default fallback
  default: "default.svg",
};

// Get the SVG file path for a transaction image key
// Returns null if no SVG file exists for the given key
export function getSvgFilePath(imageKey: TransactionImageKey): string | null {
  const fileName = SVG_FILE_MAPPING[imageKey];
  if (!fileName) {
    return null;
  }
  return `/icons/transactions/svg-templates/${fileName}`;
}

// SVG loading utility with custom template override support
// Returns null for operations without SVG files to allow component-specific handling
export async function loadTransactionSvg(
  imageKey: TransactionImageKey,
  debtAsset?: string,
  collateralAsset?: string,
  customTemplate?: string,
): Promise<string | null> {
  try {
    // Use custom template if provided, otherwise use mapping
    const svgPath = customTemplate
      ? `/icons/transactions/svg-templates/${customTemplate}.svg`
      : getSvgFilePath(imageKey);

    if (!svgPath) {
      // No SVG file exists for this operation
      return null;
    }

    const response = await fetch(svgPath);

    if (!response.ok) {
      console.error(`Failed to load SVG file: ${svgPath} (${response.status})`);
      return null;
    }

    let svgText = await response.text();

    // Replace asset placeholders with actual icon IDs (if assets provided)
    if (debtAsset) {
      svgText = svgText.replace(/#DEBT_ICON/g, `#${getAssetIconId(debtAsset)}`);
    }
    if (collateralAsset) {
      svgText = svgText
        .replace(/#COLLATERAL_ICON/g, `#${getAssetIconId(collateralAsset)}`)
        .replace(/#ASSET_ICON/g, `#${getAssetIconId(collateralAsset)}`); // For single asset templates
    }

    return svgText;
  } catch (error) {
    console.error(`Failed to load SVG for ${imageKey}:`, error);
    return null;
  }
}
