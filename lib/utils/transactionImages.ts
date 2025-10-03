import { Transaction } from "@/types/api/troveHistory";

// Transaction image types
export type TransactionImageKey =
  | "openTrove"
  | "closeTrove"
  | "closeTrove_repayAndWithdraw"
  | "closeTrove_withdrawOnly"
  // AdjustTrove variations - dual asset operations
  | "adjustTrove_borrowAndDeposit" // debtChange > 0, collChange > 0
  | "adjustTrove_repayAndWithdraw" // debtChange < 0, collChange < 0
  | "adjustTrove_repayAndDeposit" // debtChange < 0, collChange > 0
  | "adjustTrove_borrowAndWithdraw" // debtChange > 0, collChange < 0
  // AdjustTrove variations - single asset operations
  | "adjustTrove_borrowOnly" // debtChange > 0, collChange = 0
  | "adjustTrove_repayOnly" // debtChange < 0, collChange = 0
  | "adjustTrove_depositOnly" // debtChange = 0, collChange > 0
  | "adjustTrove_withdrawOnly" // debtChange = 0, collChange < 0
  | "adjustTroveInterestRate_increase"
  | "adjustTroveInterestRate_decrease"
  | "adjustTroveInterestRate_increase_delegated"
  | "adjustTroveInterestRate_decrease_delegated"
  | "applyPendingDebt_single"
  | "applyPendingDebt_combined"
  | "liquidate_beneficial"
  | "liquidate_harmful"
  | "redeemCollateral"
  | "openTroveAndJoinBatch"
  | "setInterestBatchManager"
  | "removeFromBatch"
  | "transferTrove"
  | "joinBatch"
  | "exitBatch"
  | "default";

// Get transaction image key based on transaction data
export function getTransactionImageKey(tx: Transaction): TransactionImageKey {
  // Check batch operations first (from batchUpdate.operation)
  if (tx.type === "trove" && tx.batchUpdate?.operation) {
    if (tx.batchUpdate.operation === "joinBatch") {
      return "joinBatch";
    }
    if (tx.batchUpdate.operation === "exitBatch") {
      return "exitBatch";
    }
  }

  switch (tx.operation) {
    case "openTrove":
      return "openTrove";

    case "closeTrove": {
      const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;

      // If there's debt repayment, use repayAndWithdraw variant
      // Otherwise use withdrawOnly variant
      const hasDebtRepayment = debtChangeFromOperation < 0;
      return hasDebtRepayment ? "closeTrove_repayAndWithdraw" : "closeTrove_withdrawOnly";
    }

    case "adjustTrove": {
      const { debtChangeFromOperation, collChangeFromOperation } = tx.troveOperation;

      const debtChange = debtChangeFromOperation;
      const collChange = collChangeFromOperation;

      // Dual-asset operations (both debt and collateral change)
      if (debtChange !== 0 && collChange !== 0) {
        if (debtChange > 0 && collChange > 0) {
          return "adjustTrove_borrowAndDeposit"; // Borrowing BOLD + Depositing collateral
        } else if (debtChange < 0 && collChange < 0) {
          return "adjustTrove_repayAndWithdraw"; // Repaying BOLD + Withdrawing collateral
        } else if (debtChange < 0 && collChange > 0) {
          return "adjustTrove_repayAndDeposit"; // Repaying BOLD + Depositing collateral
        } else if (debtChange > 0 && collChange < 0) {
          return "adjustTrove_borrowAndWithdraw"; // Borrowing BOLD + Withdrawing collateral
        }
      }

      // Single-asset operations (only debt or collateral changes)
      if (debtChange !== 0 && collChange === 0) {
        return debtChange > 0 ? "adjustTrove_borrowOnly" : "adjustTrove_repayOnly";
      }

      if (collChange !== 0 && debtChange === 0) {
        return collChange > 0 ? "adjustTrove_depositOnly" : "adjustTrove_withdrawOnly";
      }

      // Fallback (shouldn't happen - no changes)
      return "adjustTrove_borrowOnly";
    }

    case "adjustTroveInterestRate": {
      const rateAfter = tx.stateAfter.annualInterestRate;
      const rateBefore = tx.stateBefore?.annualInterestRate;
      const isIncrease = rateBefore && rateAfter > rateBefore;
      const isDelegated = "isInBatch" in tx && tx.isInBatch;

      if (isDelegated) {
        return isIncrease ? "adjustTroveInterestRate_increase_delegated" : "adjustTroveInterestRate_decrease_delegated";
      } else {
        return isIncrease ? "adjustTroveInterestRate_increase" : "adjustTroveInterestRate_decrease";
      }
    }

    case "applyPendingDebt": {
      const { debtIncreaseFromRedist, collIncreaseFromRedist, debtChangeFromOperation } = tx.troveOperation;
      const hasRedistribution = debtIncreaseFromRedist > 0 || collIncreaseFromRedist > 0;
      const hasInterest = debtChangeFromOperation > 0;

      // Combined sources if both redistribution and interest
      if (hasRedistribution && hasInterest) {
        return "applyPendingDebt_combined";
      }

      // Also combined if both collateral and debt redistribution
      if (collIncreaseFromRedist > 0 && debtIncreaseFromRedist > 0) {
        return "applyPendingDebt_combined";
      }

      return "applyPendingDebt_single";
    }

    case "liquidate": {
      // Check if it's a beneficial liquidation
      if ("collIncreaseFromRedist" in tx.troveOperation) {
        const { collIncreaseFromRedist } = tx.troveOperation;
        const isBeneficial = tx.stateAfter.debt > 0 && collIncreaseFromRedist > 0;
        return isBeneficial ? "liquidate_beneficial" : "liquidate_harmful";
      }
      return "liquidate_harmful";
    }

    case "redeemCollateral":
      return "redeemCollateral";

    case "openTroveAndJoinBatch":
      return "openTroveAndJoinBatch";

    case "setInterestBatchManager":
      return "setInterestBatchManager";

    case "removeFromBatch":
      return "removeFromBatch";

    case "transferTrove":
      return "transferTrove";

    default:
      return "default";
  }
}
