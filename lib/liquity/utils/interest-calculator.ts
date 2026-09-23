import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { isLiquityEvent } from "@/lib/shared/types/activity";

const ONE_YEAR = 31_557_600;

/**
 * `annualInterestRate` is supplied in **percent units** (0.8 = 0.8% APR) —
 * matching the convention rails-server-onboarding's API uses (it decodes the on-chain
 * 1e18 fixed-point as decimals=16, leaving the value already in percent). The
 * formula divides by 100 to convert to a fraction before multiplying by debt.
 */
export function calculateAccruedInterest(
  recordedDebt: number,
  annualInterestRate: number,
  lastUpdateTime: number,
  currentTime: number,
): number {
  if (recordedDebt <= 0 || annualInterestRate <= 0) return 0;
  const elapsed = currentTime - lastUpdateTime;
  if (elapsed <= 0) return 0;
  return (recordedDebt * (annualInterestRate / 100) * elapsed) / ONE_YEAR;
}

export function calculateInterestBetweenTransactions(
  currentEvent: BaseActivityEvent,
  previousEvent: BaseActivityEvent,
): { accruedInterest: number; accruedManagementFees: number } {
  if (!isLiquityEvent(currentEvent) || !isLiquityEvent(previousEvent)) {
    return { accruedInterest: 0, accruedManagementFees: 0 };
  }
  const prevCtx = previousEvent.context.data;
  const prevState = prevCtx.stateAfter;
  const elapsed = currentEvent.timestamp - previousEvent.timestamp;
  if (elapsed <= 0) return { accruedInterest: 0, accruedManagementFees: 0 };
  const accruedInterest = calculateAccruedInterest(
    prevState.debt,
    prevState.annualInterestRate,
    previousEvent.timestamp,
    currentEvent.timestamp,
  );
  let accruedManagementFees = 0;
  if (prevCtx.isInBatch && prevCtx.batchUpdate?.annualManagementFee) {
    accruedManagementFees = calculateAccruedInterest(
      prevState.debt,
      prevCtx.batchUpdate.annualManagementFee,
      previousEvent.timestamp,
      currentEvent.timestamp,
    );
  }
  return { accruedInterest, accruedManagementFees };
}
