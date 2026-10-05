import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { isLiquityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";

/** Liquity V2's year (Constants.sol `ONE_YEAR = 365 days`): interest is
 *  recorded debt × rate × seconds ÷ this (LiquityBase._calcInterest). */
const ONE_YEAR = 31_536_000;

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

/** A raw log integer at `places`, else the API's rounded float. The floats
 *  are rounded for display (a rate to two places, a debt to cents); interest
 *  worked from them drifts from the contract's (4.12% for 4.12302% is 0.07%
 *  short on every event). */
function rawAt(raw: string | undefined | null, places: number, float: number): number {
  if (raw == null || raw === "" || !/^-?\d+$/.test(raw)) return float;
  const n = Number(raw) / 10 ** places;
  return Number.isFinite(n) ? n : float;
}

/** The trove's rate after an event, at the log's precision (percent). */
export function exactRateAfter(ctx: LiquityContext): number {
  return rawAt(ctx.stateAfter?.raw?.annualInterestRate, 16, ctx.stateAfter?.annualInterestRate ?? 0);
}

/** The trove's debt after an event, at the log's precision. */
export function exactDebtAfter(ctx: LiquityContext): number {
  return rawAt(ctx.stateAfter?.raw?.debt, 18, ctx.stateAfter?.debt ?? 0);
}

/** The trove's debt before an event, at the log's precision. */
export function exactDebtBefore(ctx: LiquityContext): number {
  return rawAt(ctx.stateBefore?.raw?.debt, 18, ctx.stateBefore?.debt ?? 0);
}

export function calculateInterestBetweenTransactions(
  currentEvent: BaseActivityEvent,
  previousEvent: BaseActivityEvent,
): { accruedInterest: number; accruedManagementFees: number } {
  if (!isLiquityEvent(currentEvent) || !isLiquityEvent(previousEvent)) {
    return { accruedInterest: 0, accruedManagementFees: 0 };
  }
  const prevCtx = previousEvent.context.data;
  const curCtx = currentEvent.context.data;
  const elapsed = currentEvent.timestamp - previousEvent.timestamp;
  if (elapsed <= 0 || !prevCtx.stateAfter) return { accruedInterest: 0, accruedManagementFees: 0 };
  const debt = exactDebtAfter(prevCtx);
  const accruedInterest = calculateAccruedInterest(
    debt,
    exactRateAfter(prevCtx),
    previousEvent.timestamp,
    currentEvent.timestamp,
  );
  const fee = batchFeeInForce(prevCtx, curCtx);
  const accruedManagementFees =
    fee != null && fee > 0 ? calculateAccruedInterest(debt, fee, previousEvent.timestamp, currentEvent.timestamp) : 0;
  return { accruedInterest, accruedManagementFees };
}

/** The batch's annual management fee (percent) in force between two events,
 *  from a BatchUpdated log either one carries: the earlier event's, else the
 *  later one's while the trove stayed in the batch (a fee change is its own
 *  event, so none falls between them). Null where the trove was batched and
 *  neither event carries the log; 0 where it was not batched. */
export function batchFeeInForce(prevCtx: LiquityContext, curCtx: LiquityContext): number | null {
  if (!prevCtx.isInBatch) return 0;
  const prevFee = prevCtx.batchUpdate?.annualManagementFee;
  if (prevFee != null) return prevFee;
  const curFee = curCtx.batchUpdate?.annualManagementFee;
  return curFee != null ? curFee : null;
}
