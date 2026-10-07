// A batch manager's rate change split into interest, management fee and
// upfront fee. Kept free of the prose modules so the Lifetime flows replay
// (lib/shared/liquity-flows.ts) and the event row share the one computation.

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { isLiquityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import {
  batchFeeInForce,
  calculateAccruedInterest,
  exactDebtAfter,
  exactDebtBefore,
  exactRateAfter,
} from "@/lib/liquity/utils/interest-calculator";

/** Liquity V2's `INTEREST_RATE_ADJ_COOLDOWN`: a batch manager who changes the
 *  rate within 7 days of the batch's previous change pays the upfront fee. */
const RATE_ADJ_COOLDOWN = 7 * 86_400;

/** A batch manager's rate change: the debt's move since the trove's previous
 *  event, split into the interest and management fee accrued over that span
 *  (recorded debt × rate or fee × seconds ÷ 365 days) and the upfront fee, the
 *  rest of the move, charged when the change fell inside the cooldown. The
 *  three parts sum to the move. No TroveOperation log states the upfront fee
 *  on this row, so it is the remainder; a remainder under 0.001% of the debt is
 *  the batch's compounding between touches and is spread over the two
 *  accruals. Null where the previous event or the batch fee is unknown. */
export interface BatchRateDebtMove {
  total: number;
  interest: number;
  fee: number;
  upfront: number;
  /** The trove's previous event (unix seconds), and the seconds since. */
  since: number;
  elapsed: number;
  /** The rate and the fee in force over the span (percent). */
  rate: number;
  feeRate: number;
}

export function batchRateDebtMove(
  ctx: LiquityContext,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
): BatchRateDebtMove | null {
  if (ctx.operation !== "setBatchManagerAnnualInterestRate" || !previousEvent || !currentEvent) return null;
  if (!isLiquityEvent(previousEvent)) return null;
  const prevCtx = previousEvent.context.data;
  const elapsed = currentEvent.timestamp - previousEvent.timestamp;
  const feeRate = batchFeeInForce(prevCtx, ctx);
  if (elapsed < 0 || feeRate == null) return null;
  const debt = exactDebtBefore(ctx);
  const total = exactDebtAfter(ctx) - debt;
  const rate = prevCtx.stateAfter ? exactRateAfter(prevCtx) : ctx.stateBefore.annualInterestRate;
  let interest = calculateAccruedInterest(debt, rate, previousEvent.timestamp, currentEvent.timestamp);
  let fee = calculateAccruedInterest(debt, feeRate, previousEvent.timestamp, currentEvent.timestamp);
  const rest = total - interest - fee;
  let upfront = 0;
  if (elapsed < RATE_ADJ_COOLDOWN && rest > Math.max(0.01, debt * 1e-5)) {
    upfront = rest;
  } else if (interest + fee > 0) {
    const scale = total / (interest + fee);
    interest *= scale;
    fee *= scale;
  }
  return { total, interest, fee, upfront, since: previousEvent.timestamp, elapsed, rate, feeRate };
}
