// What a Liquity V2 trove's debt accrued between its previous event and this
// one: interest, and the batch's management fee while the trove was batched.
// The card's debt sub-line, the explanation and the debt ledger state the one
// figure. Where the page carries the ledger (the Lifetime flows replay,
// lib/shared/liquity-flows.ts), its Interest and Batch management fees legs
// for this event ARE the figure; elsewhere the logs give the same remainder:
//
//     debt after − debt before − act − upfront fee − redistributed debt
//
// split by the rate and the batch fee in force before the event. With no
// TroveOperation log (a batch manager's rate change) it is worked from the
// rate: recorded debt × (rate + fee) × seconds ÷ 365 days.

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { isLiquityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import { LQ } from "@/lib/shared/liquity-flows";
import { L2_WORDS } from "@/lib/liquity/event-templates";
import {
  batchFeeInForce,
  calculateAccruedInterest,
  calculateInterestBetweenTransactions,
  exactDebtAfter,
  exactDebtBefore,
  exactRateAfter,
} from "@/lib/liquity/utils/interest-calculator";

export interface LiquityAccrual {
  /** Interest plus management fee. */
  total: number;
  interest: number;
  fee: number;
  /** The trove was in a batch before this event, so the debt carried the
   *  batch's management fee. */
  batched: boolean;
  /** The interest and the fee are told apart (false: a batched trove whose
   *  fee rate neither event states, so `interest` is the whole total). */
  split: boolean;
  /** Where the figure comes from. */
  source: "ledger" | "logs" | "rate";
}

export const NO_ACCRUAL: LiquityAccrual = {
  total: 0,
  interest: 0,
  fee: 0,
  batched: false,
  split: true,
  source: "rate",
};

function wasBatched(ctx: LiquityContext, prevCtx?: LiquityContext): boolean {
  if (prevCtx) return prevCtx.isInBatch;
  // The before-state's origin omits the debt where the previous state was batched.
  return ctx.stateBefore?.origin != null && !ctx.stateBefore.origin.debt;
}

/** The accrual for this event. `ledger` is the page's replay of this event
 *  (FlowFocus), where it has one. */
export function liquityAccrual(
  ctx: LiquityContext,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
  ledger?: FocusEvent | null,
): LiquityAccrual {
  const prevCtx = previousEvent && isLiquityEvent(previousEvent) ? previousEvent.context.data : undefined;
  const batched = wasBatched(ctx, prevCtx);

  if (ledger) {
    let interest = 0;
    let fee = 0;
    for (const l of ledger.legs) {
      if (l.bucket === LQ.interest) interest += l.amount ?? l.usd ?? 0;
      else if (l.bucket === LQ.batchFee) fee += l.amount ?? l.usd ?? 0;
    }
    return { total: interest + fee, interest, fee, batched: batched || fee > 0, split: true, source: "ledger" };
  }

  const op = ctx.troveOperation;
  if (op && ctx.operation !== "liquidate" && ctx.stateBefore && ctx.stateBefore.debt > 0 && !ctx.noChangeRun) {
    const total =
      exactDebtAfter(ctx) -
      exactDebtBefore(ctx) -
      op.debtChangeFromOperation -
      op.debtIncreaseFromUpfrontFee -
      Math.max(0, op.debtIncreaseFromRedist);
    const t = Math.abs(total) < 0.005 ? 0 : total;
    if (!batched) return { total: t, interest: t, fee: 0, batched, split: true, source: "logs" };
    const feeRate = prevCtx ? batchFeeInForce(prevCtx, ctx) : (ctx.batchUpdate?.annualManagementFee ?? null);
    if (feeRate == null) return { total: t, interest: t, fee: 0, batched, split: false, source: "logs" };
    const rate = prevCtx ? exactRateAfter(prevCtx) : ctx.stateBefore.annualInterestRate;
    const share = feeRate > 0 && rate + feeRate > 0 ? feeRate / (rate + feeRate) : 0;
    return { total: t, interest: t * (1 - share), fee: t * share, batched, split: true, source: "logs" };
  }

  if (previousEvent && currentEvent) {
    const calc = calculateInterestBetweenTransactions(currentEvent, previousEvent);
    const feeKnown = !prevCtx || batchFeeInForce(prevCtx, ctx) != null;
    return {
      total: calc.accruedInterest + calc.accruedManagementFees,
      interest: calc.accruedInterest,
      fee: calc.accruedManagementFees,
      batched,
      split: feeKnown,
      source: "rate",
    };
  }
  return { ...NO_ACCRUAL, batched };
}

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

/** "interest" or "interest and fees", as the debt line names its accrual. */
export function accrualNoun(a: LiquityAccrual): string {
  return a.batched ? L2_WORDS.interest_and_fees : L2_WORDS.interest;
}

/** The batch's annual management fee (percent) in force after this event,
 *  and where it is read: the event's BatchUpdated log, else the ledger's
 *  rate in force (rate + fee) less the trove's rate. Null where the trove is
 *  not batched or neither states it. */
export interface BatchFeeAfter {
  fee: number;
  source: "log" | "ledger";
}

export function batchFeeAfter(ctx: LiquityContext, ledger?: FocusEvent | null): BatchFeeAfter | null {
  if (!ctx.isInBatch) return null;
  const logged = ctx.batchUpdate?.annualManagementFee;
  if (logged != null) return { fee: logged, source: "log" };
  if (ledger?.rate == null) return null;
  const fee = Math.round((ledger.rate - exactRateAfter(ctx)) * 1e6) / 1e6;
  return fee > 0 ? { fee, source: "ledger" } : null;
}
