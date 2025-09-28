/**
 * Debt In Front Calculator for Liquity V2
 * Calculates the amount of debt "in front" of a trove in the redemption queue
 * Uses real API data - no mocking required
 */

import { TroveSummary } from "@/types/api/trove";
import { InterestCalculator } from "./interest-calculator";

export interface TroveWithCalculatedDebt {
  trove: TroveSummary;
  recordedDebt: number;
  accruedInterest: number;
  managementFees: number;
  totalDebt: number;
}

export interface DebtInFrontResult {
  debtInFront: number;
  trovesAhead: number;
  lastCalculated: Date;
  collateralType: string;
  targetInterestRate: number;
  troveDetails: TroveWithCalculatedDebt[];
  troveBehind?: TroveWithCalculatedDebt;
}

export class DebtInFrontCalculator {
  private interestCalculator: InterestCalculator;
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = '/api') {
    this.interestCalculator = new InterestCalculator();
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Fetch troves with lower interest rates for the same collateral type
   */
  async fetchTrovesWithLowerRates(
    targetTrove: TroveSummary
  ): Promise<TroveSummary[]> {
    // Build query to get all open troves with same collateral type
    // The backend should ideally support interest rate filtering
    const params = new URLSearchParams({
      status: 'open',
      collateralType: targetTrove.collateralType,
      sortBy: 'interestRate',
      sortOrder: 'asc',
      limit: '100' // Start with smaller limit for debugging
    });

    const url = `${this.apiBaseUrl}/troves?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch troves: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter for troves with strictly lower interest rates
    const trovesWithLowerRates = data.data.filter((trove: TroveSummary) =>
      trove.metrics.interestRate < targetTrove.metrics.interestRate &&
      trove.id !== targetTrove.id
    );

    return trovesWithLowerRates;
  }

  /**
   * Calculate total debt in front of a specific trove
   */
  async calculateDebtInFront(
    targetTrove: TroveSummary,
    includeAccruedInterest: boolean = true
  ): Promise<DebtInFrontResult> {
    // Fetch all troves for sorting
    const params = new URLSearchParams({
      status: 'open',
      collateralType: targetTrove.collateralType,
      sortBy: 'interestRate',
      sortOrder: 'asc',
      limit: '100'
    });

    const url = `${this.apiBaseUrl}/troves?${params}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch troves: ${response.statusText}`);
    }

    const data = await response.json();

    // Filter for troves ahead in queue
    // Troves are ahead if they have:
    // 1. Lower interest rate, OR
    // 2. Same interest rate but lower ID (tiebreaker)
    const trovesAhead = data.data.filter((trove: TroveSummary) =>
      trove.id !== targetTrove.id && (
        trove.metrics.interestRate < targetTrove.metrics.interestRate ||
        (trove.metrics.interestRate === targetTrove.metrics.interestRate &&
         trove.id < targetTrove.id)
      )
    );

    // Find the trove immediately behind (next higher rate)
    const troveBehindList = data.data.filter((trove: TroveSummary) =>
      (trove.metrics.interestRate > targetTrove.metrics.interestRate ||
      (trove.metrics.interestRate === targetTrove.metrics.interestRate && trove.id > targetTrove.id)) &&
      trove.id !== targetTrove.id
    ).sort((a: TroveSummary, b: TroveSummary) => {
      const rateDiff = a.metrics.interestRate - b.metrics.interestRate;
      if (Math.abs(rateDiff) < 0.0001) {
        return a.id.localeCompare(b.id);
      }
      return rateDiff;
    });

    let totalDebtInFront = 0;
    const troveDetails: TroveWithCalculatedDebt[] = [];

    // Process troves ahead
    for (const trove of trovesAhead) {
      const calculatedDebt = this.calculateTroveDebt(trove, includeAccruedInterest);
      totalDebtInFront += calculatedDebt.totalDebt;
      troveDetails.push(calculatedDebt);
    }

    // Process the trove behind (if exists)
    let troveBehind: TroveWithCalculatedDebt | undefined;
    if (troveBehindList.length > 0) {
      troveBehind = this.calculateTroveDebt(troveBehindList[0], includeAccruedInterest);
    }

    // Sort by interest rate and then by ID for display
    troveDetails.sort((a, b) => {
      const rateDiff = a.trove.metrics.interestRate - b.trove.metrics.interestRate;
      if (Math.abs(rateDiff) < 0.0001) {
        // Same rate, sort by ID
        return a.trove.id.localeCompare(b.trove.id);
      }
      return rateDiff;
    });

    return {
      debtInFront: totalDebtInFront,
      trovesAhead: trovesAhead.length,
      lastCalculated: new Date(),
      collateralType: targetTrove.collateralType,
      targetInterestRate: targetTrove.metrics.interestRate,
      troveDetails,
      troveBehind
    };
  }

  /**
   * Calculate debt for a single trove
   */
  private calculateTroveDebt(
    trove: TroveSummary,
    includeAccruedInterest: boolean
  ): TroveWithCalculatedDebt {
    const recordedDebt = parseFloat(trove.debt.currentRaw) / 1e18;
    let accruedInterest = 0;
    let managementFees = 0;
    let totalDebt = recordedDebt;

    if (includeAccruedInterest) {
      const lastUpdateTime = trove.activity.lastActivityAt;
      const interestInfo = this.interestCalculator.generateInterestInfo(
        recordedDebt,
        trove.metrics.interestRate,
        lastUpdateTime,
        trove.batch.isMember,
        trove.batch.managementFee,
        trove.batch.manager || undefined
      );

      accruedInterest = interestInfo.accruedInterest;
      managementFees = interestInfo.accruedManagementFees || 0;
      totalDebt = interestInfo.entireDebt;
    } else {
      totalDebt = trove.debt.current;
    }

    return {
      trove,
      recordedDebt,
      accruedInterest,
      managementFees,
      totalDebt
    };
  }

  /**
   * Format debt amount for display
   */
  formatDebtAmount(amount: number): string {
    if (amount < 1000) {
      return `${amount.toFixed(0)} BOLD`;
    } else if (amount < 1000000) {
      return `${(amount / 1000).toFixed(1)}K BOLD`;
    } else if (amount < 1000000000) {
      return `${(amount / 1000000).toFixed(2)}M BOLD`;
    } else {
      return `${(amount / 1000000000).toFixed(2)}B BOLD`;
    }
  }

  /**
   * Check if debt in front calculation is stale
   */
  isCalculationStale(lastCalculated: Date, maxAgeMinutes: number = 5): boolean {
    const now = new Date();
    const ageInMinutes = (now.getTime() - lastCalculated.getTime()) / (1000 * 60);
    return ageInMinutes > maxAgeMinutes;
  }
}