// Types for trove activity timeline - transaction history and state changes
// These types define the API response structure for trove activity endpoints

// ============================================
// CORE TYPES
// ============================================

// Define the operation type separately for reuse
export type TroveOperationType =
  | "openTrove"
  | "closeTrove"
  | "adjustTrove"
  | "adjustTroveInterestRate"
  | "applyPendingDebt"
  | "liquidate"
  | "redeemCollateral"
  | "openTroveAndJoinBatch"
  | "setInterestBatchManager"
  | "removeFromBatch";

// Batch operation types
export type BatchOperationType =
  | "registerBatchManager"
  | "lowerBatchManagerAnnualFee"
  | "setBatchManagerAnnualInterestRate"
  | "applyBatchInterestAndFee"
  | "joinBatch"
  | "exitBatch"
  | "troveChange";

// ============================================
// COMMON DATA STRUCTURES
// ============================================

// Trove state at a point in time (before or after an operation)
export interface TroveState {
  debt: number; // Direct from TroveUpdated OR calculated for batch troves
  coll: number; // Available in both TroveUpdated and BatchedTroveUpdated
  stake: number;
  annualInterestRate: number; // Direct or from batch data
  collateralRatio: number; // Backend calculated: (coll * price) / debt * 100
  collateralInUsd: number; // Total collateral value in USD from coll_usd field

  // Optional batch-specific fields
  interestBatchManager?: string; // From BatchedTroveUpdated
  batchDebtShares?: number; // From BatchedTroveUpdated (converted to number)
}

// TroveOperation event data - emitted for all operations
export interface TroveOperationData {
  annualInterestRate: number;
  debtIncreaseFromRedist: number;
  debtIncreaseFromUpfrontFee: number;
  debtChangeFromOperation: number;
  collIncreaseFromRedist: number;
  collChangeFromOperation: number;
}

// ============================================
// TRANSACTION TYPES
// ============================================

// Same-block operation grouping info
export interface BlockGrouping {
  isGrouped: boolean;        // true if multiple operations in same block
  sameBlockCount: number;     // total operations in this block (e.g., 3)
  sameBlockIndex: number;     // position within block (e.g., 1, 2, 3)
}

// Base transaction data - ALL transactions have these fields
interface BaseTransaction {
  id: string; // Unique ID for frontend (txHash + logIndex)
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  troveId: string;
  protocolName: string;
  assetType: string;
  collateralType: string;
  gasFee: number;
  gasFeeUsd: number;

  stateBefore: TroveState;
  stateAfter: TroveState;

  collateralPrice: number;
  isInBatch: boolean;
  isZombieTrove: boolean;
  
  // Same-block operation grouping
  blockGrouping: BlockGrouping;
}

// Standard trove operation (open, close, adjust, etc.)
export interface TroveTransaction extends BaseTransaction {
  type: "trove";
  operation: TroveOperationType;

  // From TroveOperation event
  troveOperation: TroveOperationData;

  // From BatchUpdated event (only for batch operations)
  batchUpdate?: {
    operation: BatchOperationType;
    batchDebt: number; // Total batch debt
    batchColl: number; // Total batch collateral
    annualInterestRate: number;
    annualManagementFee: number;
    totalDebtShares: number;
  };

  // Transfer details for openTrove (mint) and closeTrove (burn)
  relatedTransfer?: {
    transferType: "mint" | "burn";
    fromAddress: string;
    toAddress: string;
  };
}

// Liquidation affecting a specific trove
export interface TroveLiquidationTransaction extends BaseTransaction {
  type: "liquidation";
  operation: "liquidate"; // From TroveOperationType

  // From system-wide Liquidation event
  systemLiquidation: {
    debtOffsetBySP: number;
    debtRedistributed: number;
    boldGasCompensation: number;
    collGasCompensation: number;
    collSentToSP: number;
    collRedistributed: number;
    collSurplus: number;
    price: number;
  };

  // From TroveOperation event
  troveOperation: TroveOperationData;
  // Note: debtChangeFromOperation and collChangeFromOperation are negative (amounts redeemed/taken)

  // If trove was in batch, BatchUpdated(exitBatch) is also emitted
  batchExitUpdate?: {
    operation: "exitBatch";
    interestBatchManager: string;
    batchDebt: number;
    batchColl: number;
    annualInterestRate: number;
    annualManagementFee: number;
    totalDebtShares: number;
  };
}

// Redemption affecting a specific trove
export interface TroveRedemptionTransaction extends BaseTransaction {
  type: "redemption";
  operation: "redeemCollateral"; // From TroveOperationType

  // From system-wide Redemption event
  systemRedemption: {
    attemptedBoldAmount: number;
    actualBoldAmount: number;
    ETHSent: number;
    ETHFee: string;
    price: number;
    redemptionPrice: number;
  };

  // From TroveOperation event for this trove
  troveOperation: TroveOperationData;
  // Note: debtChangeFromOperation and collChangeFromOperation are negative (amounts redeemed/taken)

  // From BatchUpdated event (if trove was in batch)
  batchUpdate?: {
    operation: "troveChange";
    batchDebt: number;
    batchColl: number;
    annualInterestRate: number;
    annualManagementFee: number;
    totalDebtShares: number;
  };

  // From RedemptionFeePaidToTrove event (always emitted, might be "0")
  redemptionFee: string;
}

// Transfer of trove ownership
export interface TroveTransferTransaction extends BaseTransaction {
  type: "transfer";
  operation: "transferTrove";

  // Transfer details
  transferType: "mint" | "burn" | "transfer";
  fromAddress: string;
  toAddress: string;
}

// ============================================
// UNION AND RESPONSE TYPES
// ============================================

// Union type for all transactions
export type Transaction =
  | TroveTransaction
  | TroveLiquidationTransaction
  | TroveRedemptionTransaction
  | TroveTransferTransaction;

// Timeline interface for API response
export interface TransactionTimeline {
  troveId: string;
  transactions: Transaction[];
  totalTransactions: number;
  pagination?: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================
// TYPE GUARDS
// ============================================

export function isTroveTransaction(tx: Transaction): tx is TroveTransaction {
  return tx.type === "trove";
}

export function isLiquidationTransaction(
  tx: Transaction
): tx is TroveLiquidationTransaction {
  return tx.type === "liquidation";
}

export function isRedemptionTransaction(
  tx: Transaction
): tx is TroveRedemptionTransaction {
  return tx.type === "redemption";
}

export function isTransferTransaction(
  tx: Transaction
): tx is TroveTransferTransaction {
  return tx.type === "transfer";
}

// Helper type guard for checking if transaction has batch info
export function hasBatchInfo(tx: Transaction): boolean {
  return tx.isInBatch;
}
