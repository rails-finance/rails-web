/**
 * Interest calculation utilities for Liquity V2 protocol
 * Implements real-time interest accrual calculations
 */

import type { Transaction, isBatchManagerOperation as isBatchManagerOperationType } from "@/types/api/troveHistory";

export interface InterestInfo {
  recordedDebt: number;
  accruedInterest: number;
  entireDebt: number;
  lastUpdateTimestamp: number;
  calculationTimestamp: number;
  annualInterestRatePercent: number;
  daysSinceUpdate?: number;
  isBatchMember?: boolean;
  accruedManagementFees?: number;
  batchManager?: string;
}

// Constants
const ONE_YEAR = 365.25 * 24 * 60 * 60; // 31,557,600 seconds (365.25 days)

/**
 * Calculate accrued interest for a trove
 */
export function calculateAccruedInterest(
  recordedDebt: number,
  annualInterestRate: number,
  lastDebtUpdateTime: number,
  currentTime: number = Date.now() / 1000,
): number {
  // Calculate time period in seconds
  const timePeriod = Math.max(0, currentTime - lastDebtUpdateTime);

  // If no time has passed, no interest accrued
  if (timePeriod === 0) {
    return 0;
  }

  // Convert annual rate percentage to decimal (e.g., 3.9% -> 0.039)
  const rateDecimal = annualInterestRate / 100;

  // Calculate interest using compound interest approximation
  // For short periods, this is very close to continuous compounding
  const accruedInterest = recordedDebt * rateDecimal * (timePeriod / ONE_YEAR);

  return accruedInterest;
}

/**
 * Calculate batch management fees
 */
export function calculateManagementFees(
  recordedDebt: number,
  managementFeeRate: number,
  lastUpdateTime: number,
  currentTime: number = Date.now() / 1000,
): number {
  const timePeriod = Math.max(0, currentTime - lastUpdateTime);

  if (timePeriod === 0) {
    return 0;
  }

  // Convert management fee rate percentage to decimal
  const feeRateDecimal = managementFeeRate / 100;

  // Management fees are calculated similarly to interest
  const managementFees = recordedDebt * feeRateDecimal * (timePeriod / ONE_YEAR);

  return managementFees;
}

/**
 * Calculate the entire debt including all components
 */
export function calculateEntireDebt(
  recordedDebt: number,
  accruedInterest: number,
  accruedManagementFees: number = 0,
): number {
  return recordedDebt + accruedInterest + accruedManagementFees;
}

/**
 * Interest rate period for segmented calculation
 */
export interface RatePeriod {
  startTime: number;
  endTime: number;
  interestRate: number;
  managementFee: number;
  startingDebt: number;
}

/**
 * Calculate accrued interest across multiple rate periods
 * This accounts for delegate rate changes over time
 */
export function calculateSegmentedInterest(
  ratePeriods: RatePeriod[],
  currentTime: number = Date.now() / 1000,
): { accruedInterest: number; accruedManagementFees: number; totalAccrued: number } {
  let totalAccruedInterest = 0;
  let totalAccruedFees = 0;
  let runningDebt = 0;

  for (const period of ratePeriods) {
    runningDebt = period.startingDebt;
    const endTime = period.endTime || currentTime;
    const timePeriod = Math.max(0, endTime - period.startTime);

    // Calculate interest for this period
    const periodInterest = calculateAccruedInterest(runningDebt, period.interestRate, period.startTime, endTime);
    totalAccruedInterest += periodInterest;

    // Calculate management fees for this period
    const periodFees = calculateManagementFees(runningDebt, period.managementFee, period.startTime, endTime);
    totalAccruedFees += periodFees;

    // Debt compounds with each period
    runningDebt += periodInterest + periodFees;
  }

  return {
    accruedInterest: totalAccruedInterest,
    accruedManagementFees: totalAccruedFees,
    totalAccrued: totalAccruedInterest + totalAccruedFees,
  };
}

/**
 * Build rate periods from transaction timeline
 * Extracts all rate changes and debt updates to calculate accurate interest
 */
export function buildRatePeriodsFromTimeline(
  transactions: Transaction[],
  currentDebt: number,
  currentRate: number,
  currentManagementFee: number,
): RatePeriod[] {
  if (transactions.length === 0) {
    return [];
  }

  // Sort transactions by timestamp (oldest first)
  const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

  // Find the most recent borrower-initiated transaction (not batch manager rate changes)
  let lastBorrowerTx = sortedTxs[sortedTxs.length - 1];
  for (let i = sortedTxs.length - 1; i >= 0; i--) {
    if (sortedTxs[i].type !== "batch_manager") {
      lastBorrowerTx = sortedTxs[i];
      break;
    }
  }

  // Get all transactions after the last borrower transaction
  const relevantTxs = sortedTxs.filter((tx) => tx.timestamp > lastBorrowerTx.timestamp);

  // If no rate changes after last borrower transaction, return single period
  if (relevantTxs.length === 0) {
    return [
      {
        startTime: lastBorrowerTx.timestamp,
        endTime: 0, // Will use currentTime in calculation
        interestRate: currentRate,
        managementFee: currentManagementFee,
        startingDebt: lastBorrowerTx.stateAfter.debt,
      },
    ];
  }

  // Build periods from rate changes
  const periods: RatePeriod[] = [];
  let currentPeriodStart = lastBorrowerTx.timestamp;
  let currentPeriodDebt = lastBorrowerTx.stateAfter.debt;
  let currentPeriodRate = lastBorrowerTx.stateAfter.annualInterestRate;
  let currentPeriodManagementFee = currentManagementFee;

  for (const tx of relevantTxs) {
    // Close the current period
    periods.push({
      startTime: currentPeriodStart,
      endTime: tx.timestamp,
      interestRate: currentPeriodRate,
      managementFee: currentPeriodManagementFee,
      startingDebt: currentPeriodDebt,
    });

    // Calculate the compounded debt at the end of this period
    // This is critical for batch_manager transactions which don't emit individual trove debt
    const periodInterest = calculateAccruedInterest(currentPeriodDebt, currentPeriodRate, currentPeriodStart, tx.timestamp);
    const periodFees = calculateManagementFees(currentPeriodDebt, currentPeriodManagementFee, currentPeriodStart, tx.timestamp);
    const compoundedDebt = currentPeriodDebt + periodInterest + periodFees;

    // Start new period
    currentPeriodStart = tx.timestamp;
    // Use compounded debt for next period (important for batch_manager transactions)
    currentPeriodDebt = compoundedDebt;
    currentPeriodRate = tx.stateAfter.annualInterestRate;

    // Update management fee if this is a batch manager transaction
    if (tx.type === "batch_manager" && tx.batchUpdate) {
      currentPeriodManagementFee = tx.batchUpdate.annualManagementFee;
    }
  }

  // Add final period (from last rate change to now)
  periods.push({
    startTime: currentPeriodStart,
    endTime: 0, // Will use currentTime in calculation
    interestRate: currentRate,
    managementFee: currentManagementFee,
    startingDebt: currentPeriodDebt,
  });

  return periods;
}

/**
 * Generate interest info for display
 */
export function generateInterestInfo(
  recordedDebt: number,
  annualInterestRate: number,
  lastUpdateTimestamp: number,
  isBatchMember: boolean = false,
  managementFeeRate?: number,
  batchManager?: string,
  currentTime: number = Date.now() / 1000,
): InterestInfo {
  const accruedInterest = calculateAccruedInterest(recordedDebt, annualInterestRate, lastUpdateTimestamp, currentTime);

  let accruedManagementFees = 0;
  if (isBatchMember && managementFeeRate !== undefined) {
    accruedManagementFees = calculateManagementFees(recordedDebt, managementFeeRate, lastUpdateTimestamp, currentTime);
  }

  const entireDebt = calculateEntireDebt(recordedDebt, accruedInterest, accruedManagementFees);

  const daysSinceUpdate = (currentTime - lastUpdateTimestamp) / (24 * 60 * 60);

  return {
    recordedDebt,
    accruedInterest,
    entireDebt,
    lastUpdateTimestamp,
    calculationTimestamp: currentTime,
    annualInterestRatePercent: annualInterestRate,
    daysSinceUpdate,
    isBatchMember,
    accruedManagementFees: isBatchMember ? accruedManagementFees : undefined,
    batchManager,
  };
}

/**
 * Generate interest info using transaction timeline for accurate calculation
 * Accounts for delegate rate changes over time
 */
export function generateInterestInfoWithTimeline(
  transactions: Transaction[],
  currentDebt: number,
  currentRate: number,
  currentManagementFee: number,
  isBatchMember: boolean,
  batchManager?: string,
  currentTime: number = Date.now() / 1000,
): InterestInfo {
  // Build rate periods from transaction history
  const ratePeriods = buildRatePeriodsFromTimeline(transactions, currentDebt, currentRate, currentManagementFee);

  // If no rate periods (shouldn't happen), fall back to simple calculation
  if (ratePeriods.length === 0) {
    return generateInterestInfo(
      currentDebt,
      currentRate,
      currentTime,
      isBatchMember,
      currentManagementFee,
      batchManager,
      currentTime,
    );
  }

  // Calculate segmented interest
  const { accruedInterest, accruedManagementFees } = calculateSegmentedInterest(ratePeriods, currentTime);

  // Get the starting debt from the first period
  const recordedDebt = ratePeriods[0].startingDebt;
  const entireDebt = calculateEntireDebt(recordedDebt, accruedInterest, accruedManagementFees);

  const lastUpdateTimestamp = ratePeriods[0].startTime;
  const daysSinceUpdate = (currentTime - lastUpdateTimestamp) / (24 * 60 * 60);

  return {
    recordedDebt,
    accruedInterest,
    entireDebt,
    lastUpdateTimestamp,
    calculationTimestamp: currentTime,
    annualInterestRatePercent: currentRate,
    daysSinceUpdate,
    isBatchMember,
    accruedManagementFees: isBatchMember ? accruedManagementFees : undefined,
    batchManager,
  };
}

/**
 * Calculate accrued interest between two consecutive transactions
 * This shows how much interest accumulated since the last operation
 */
export function calculateInterestBetweenTransactions(
  currentTx: Transaction,
  previousTx?: Transaction,
): { accruedInterest: number; accruedManagementFees: number } {
  // If no previous transaction, no interest has accrued
  if (!previousTx) {
    return { accruedInterest: 0, accruedManagementFees: 0 };
  }

  // Get the debt and rate from the previous transaction
  const previousDebt = previousTx.stateAfter.debt;
  const previousRate = previousTx.stateAfter.annualInterestRate;
  const previousTimestamp = previousTx.timestamp;
  const currentTimestamp = currentTx.timestamp;

  // Calculate base interest accrued
  const accruedInterest = calculateAccruedInterest(previousDebt, previousRate, previousTimestamp, currentTimestamp);

  // Calculate management fees if in a batch
  let accruedManagementFees = 0;
  if (currentTx.isInBatch && "batchUpdate" in previousTx && previousTx.batchUpdate) {
    const managementFeeRate = previousTx.batchUpdate.annualManagementFee;
    accruedManagementFees = calculateManagementFees(previousDebt, managementFeeRate, previousTimestamp, currentTimestamp);
  }

  return { accruedInterest, accruedManagementFees };
}
