import { Transaction } from "@/types/api/troveHistory";
import { TransactionImage } from "../TransactionImage";

// Internal component for selecting the right icon based on operation
interface OperationIconProps {
  tx: Transaction;
  isFirst?: boolean;
  isLast?: boolean;
  isExpanded?: boolean;
}

export function OperationIcon({ tx, isFirst, isLast, isExpanded }: OperationIconProps) {
  // For batch operations that should override the primary operation display,
  // we modify the transaction object to use the batch operation as the primary operation
  let displayTx = tx;

  if (tx.type === "trove" && tx.batchUpdate?.operation) {
    // Don't override if primary operation already includes batch handling or should remain primary
    if (
      tx.operation !== "openTrove" &&
      tx.operation !== "openTroveAndJoinBatch" &&
      tx.operation !== "removeFromBatch" &&
      tx.operation !== "closeTrove"
    ) {
      // For other operations, check if batch operation should be displayed instead
      if (tx.batchUpdate.operation === "joinBatch" || tx.batchUpdate.operation === "exitBatch") {
        displayTx = {
          ...tx,
          operation: tx.batchUpdate.operation as any,
        };
      }
    }
  }

  // All operations use the unified TransactionImage component
  // The TransactionImage component handles all the SVG loading logic and determines
  // the correct image based on the transaction data
  return <TransactionImage tx={displayTx} isFirst={isFirst} isLast={isLast} isExpanded={isExpanded} />;
}
