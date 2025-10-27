/**
 * Raw LatestTroveData from TroveManager contract
 * All values are bigints as returned from blockchain
 */
export interface LatestTroveDataRaw {
  entireDebt: bigint;
  entireColl: bigint;
  redistBoldDebtGain: bigint;
  redistCollGain: bigint;
  accruedInterest: bigint;
  recordedDebt: bigint;
  annualInterestRate: bigint;
  weightedRecordedDebt: bigint;
  accruedBatchManagementFee: bigint;
  lastInterestRateAdjTime: bigint;
}

/**
 * Debt information from blockchain
 * Follows the pattern from trove.ts with both raw and formatted values
 */
export interface TroveStateDebt {
  entire: number;                   // Total debt including accrued interest (BOLD)
  entireRaw: string;               // Raw wei value
  recorded: number;                // Debt recorded at last update (BOLD)
  recordedRaw: string;            // Raw wei value
  accruedInterest: number;        // Interest accrued since last update (BOLD)
  accruedInterestRaw: string;     // Raw wei value
  redistGain: number;             // Debt gained from redistribution (BOLD)
  redistGainRaw: string;          // Raw wei value
  weightedRecordedRaw: string;    // recordedDebt × annualInterestRate (36 decimals, for frontend calculations only)
}

/**
 * Collateral information from blockchain
 */
export interface TroveStateCollateral {
  entire: number;                  // Total collateral including redistribution (ETH)
  entireRaw: string;              // Raw wei value
  redistGain: number;             // Collateral gained from redistribution (ETH)
  redistGainRaw: string;          // Raw wei value
}

/**
 * Interest rate and fee information
 */
export interface TroveStateRates {
  annualInterestRate: number;          // Annual interest rate (%)
  annualInterestRateRaw: string;      // Raw value (18 decimals)
  accruedBatchManagementFee: number;  // Management fee for batch operations (BOLD)
  accruedBatchManagementFeeRaw: string; // Raw wei value
  lastInterestRateAdjTime: number;    // Unix timestamp of last rate adjustment
}

/**
 * Formatted trove state response following existing API patterns
 * Provides both raw (wei) and formatted (human-readable) values
 */
export interface TroveStateData {
  debt: TroveStateDebt;
  collateral: TroveStateCollateral;
  rates: TroveStateRates;
}

export interface TroveStateResponse {
  success: boolean;
  data?: TroveStateData;
  error?: string;
}
