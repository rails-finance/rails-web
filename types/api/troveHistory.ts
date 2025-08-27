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
// STATE REPRESENTATION
// ============================================

// Trove state at a point in time (before or after an operation)
export interface TroveState {
  debt: number; // Direct from TroveUpdated OR calculated for batch troves
  coll: number; // Available in both TroveUpdated and BatchedTroveUpdated
  stake: number;
  annualInterestRate: number; // Direct or from batch data
  collateralRatio: number; // Backend calculated: (coll * price) / debt * 100

  // Optional batch-specific fields
  interestBatchManager?: string; // From BatchedTroveUpdated
  batchDebtShares?: number; // From BatchedTroveUpdated (converted to number)
}

// ============================================
// TRANSACTION TYPES
// ============================================

// Base transaction data
interface BaseTransaction {
  id: string; // Unique ID for frontend (txHash + logIndex)
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  troveId: string;
  protocolName: string;
  assetType: string;
  collateralType: string;
}

// Standard trove operation (open, close, adjust, etc.)
export interface TroveTransaction extends BaseTransaction {
  type: "trove";
  operation: TroveOperationType;

  // From TroveOperation event
  troveOperation: {
    annualInterestRate: number;
    debtIncreaseFromRedist: number;
    debtIncreaseFromUpfrontFee: number;
    debtChangeFromOperation: number;
    collIncreaseFromRedist: number;
    collChangeFromOperation: number;
  };

  // State after the operation
  stateAfter: TroveState;

  // From BatchUpdated event (only for batch operations)
  batchUpdate?: {
    operation: BatchOperationType;
    batchDebt: number; // Total batch debt
    batchColl: number; // Total batch collateral
    annualInterestRate: number;
    annualManagementFee: number;
    totalDebtShares: number;
  };

  // Backend calculated/fetched (previous state)
  stateBefore?: TroveState;

  collateralPrice?: number;
  isInBatch: boolean; // Helper to know which event type was used
  isZombieTrove?: boolean; // debt < MIN_DEBT (2000 BOLD)
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

  // From TroveOperation event for this trove
  troveOperation: {
    debtIncreaseFromRedist: number;
    collIncreaseFromRedist: number;
    debtChangeFromOperation: number; // negative (entire debt)
    collChangeFromOperation: number; // negative (entire coll)
  };

  // State after liquidation (always zero)
  stateAfter: TroveState;

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

  // Backend calculated
  stateBefore?: TroveState;

  collateralPrice?: number;
  isInBatch: boolean; // Was trove in batch before liquidation
  isZombieTrove?: boolean;
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
  troveOperation: {
    annualInterestRate: number;
    debtIncreaseFromRedist: number;
    collIncreaseFromRedist: number;
    debtChangeFromOperation: number; // negative (amount redeemed)
    collChangeFromOperation: number; // negative (collateral taken)
  };

  // State after redemption
  stateAfter: TroveState;

  // From BatchUpdated event (if trove was in batch)
  batchUpdate?: {
    operation: "troveChange";
    batchDebt: number;
    batchColl: number;
    annualInterestRate: number;
    annualManagementFee: number;
    totalDebtShares: number;
  };

  // From RedemptionFeePaidToTrove event
  redemptionFee?: string;

  // Backend calculated
  stateBefore?: TroveState;

  collateralPrice?: number;
  isInBatch: boolean;
  isZombieTrove?: boolean;
}

// ============================================
// UNION AND RESPONSE TYPES
// ============================================

// Union type for all transactions
export type Transaction = TroveTransaction | TroveLiquidationTransaction | TroveRedemptionTransaction;

// Timeline interface for API response
export interface TransactionTimeline {
  troveId: string;
  transactions: Transaction[];
  totalTransactions: number;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isTroveTransaction(tx: Transaction): tx is TroveTransaction {
  return tx.type === "trove";
}

export function isLiquidationTransaction(tx: Transaction): tx is TroveLiquidationTransaction {
  return tx.type === "liquidation";
}

export function isRedemptionTransaction(tx: Transaction): tx is TroveRedemptionTransaction {
  return tx.type === "redemption";
}

// Helper type guard for checking if transaction has batch info
export function hasBatchInfo(tx: Transaction): boolean {
  return tx.isInBatch;
}
