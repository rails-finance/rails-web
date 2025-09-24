/**
 * Interest calculation utilities for Liquity V2 protocol
 * Implements real-time interest accrual calculations
 */

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

export class InterestCalculator {
  private readonly ONE_YEAR = 365.25 * 24 * 60 * 60; // 31,557,600 seconds (365.25 days)
  private readonly DECIMAL_PRECISION = 1e18;

  /**
   * Calculate accrued interest for a trove
   */
  calculateAccruedInterest(
    recordedDebt: number,
    annualInterestRate: number,
    lastDebtUpdateTime: number,
    currentTime: number = Date.now() / 1000
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
    const accruedInterest = recordedDebt * rateDecimal * (timePeriod / this.ONE_YEAR);

    return accruedInterest;
  }

  /**
   * Calculate batch management fees
   */
  calculateManagementFees(
    recordedDebt: number,
    managementFeeRate: number,
    lastUpdateTime: number,
    currentTime: number = Date.now() / 1000
  ): number {
    const timePeriod = Math.max(0, currentTime - lastUpdateTime);
    
    if (timePeriod === 0) {
      return 0;
    }

    // Convert management fee rate percentage to decimal
    const feeRateDecimal = managementFeeRate / 100;
    
    // Management fees are calculated similarly to interest
    const managementFees = recordedDebt * feeRateDecimal * (timePeriod / this.ONE_YEAR);
    
    return managementFees;
  }

  /**
   * Calculate the entire debt including all components
   */
  calculateEntireDebt(
    recordedDebt: number,
    accruedInterest: number,
    accruedManagementFees: number = 0
  ): number {
    return recordedDebt + accruedInterest + accruedManagementFees;
  }

  /**
   * Generate interest info for display
   */
  generateInterestInfo(
    recordedDebt: number,
    annualInterestRate: number,
    lastUpdateTimestamp: number,
    isBatchMember: boolean = false,
    managementFeeRate?: number,
    batchManager?: string,
    currentTime: number = Date.now() / 1000
  ): InterestInfo {
    const accruedInterest = this.calculateAccruedInterest(
      recordedDebt,
      annualInterestRate,
      lastUpdateTimestamp,
      currentTime
    );

    let accruedManagementFees = 0;
    if (isBatchMember && managementFeeRate !== undefined) {
      accruedManagementFees = this.calculateManagementFees(
        recordedDebt,
        managementFeeRate,
        lastUpdateTimestamp,
        currentTime
      );
    }

    const entireDebt = this.calculateEntireDebt(
      recordedDebt,
      accruedInterest,
      accruedManagementFees
    );

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
}