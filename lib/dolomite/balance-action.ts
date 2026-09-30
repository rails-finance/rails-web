// What a Dolomite deposit or withdrawal did to the balance. The core has no
// Borrow or Repay action: a withdrawal that takes the balance below zero is a
// borrow, and a deposit into a negative balance is a repayment. The row label
// and the timeline filter both name the act by the balance's par before and
// after, so a repayment never reads "Deposit". A transfer between accounts
// that moves a debt is named the same way ("Sent (borrow)", "Received (repay)").

import type { DolomiteContext } from "@/lib/shared/types/event-shape";

export type DolomiteBalanceAction =
  | "deposit"
  | "repay"
  | "repay_deposit"
  | "withdraw"
  | "borrow"
  | "withdraw_borrow"
  | "sent_borrow"
  | "received_repay";

export const DOLOMITE_BALANCE_ACTION_LABELS: Record<DolomiteBalanceAction, string> = {
  deposit: "Deposit",
  repay: "Repay",
  repay_deposit: "Repay and deposit",
  withdraw: "Withdraw",
  borrow: "Borrow",
  withdraw_borrow: "Withdraw and borrow",
  sent_borrow: "Sent (borrow)",
  received_repay: "Received (repay)",
};

const sign = (v: string | undefined): number => {
  if (v == null) return 0;
  const t = v.trim();
  if (t.startsWith("-")) return /[1-9]/.test(t) ? -1 : 0;
  return /[1-9]/.test(t) ? 1 : 0;
};

/** The act a deposit or withdrawal leg performed, or a transfer leg that moved
 *  a debt; null for every other leg. */
export function dolomiteBalanceAction(
  ctx: Pick<DolomiteContext, "eventType" | "parBefore" | "parAfter">,
): DolomiteBalanceAction | null {
  const before = sign(ctx.parBefore);
  const after = sign(ctx.parAfter);
  if (ctx.eventType === "deposit") {
    if (before < 0) return after > 0 ? "repay_deposit" : "repay";
    return "deposit";
  }
  if (ctx.eventType === "withdraw") {
    if (after < 0) return before > 0 ? "withdraw_borrow" : "borrow";
    return "withdraw";
  }
  if (ctx.eventType === "transfer_out" && after < 0) return "sent_borrow";
  if (ctx.eventType === "transfer_in" && before < 0) return "received_repay";
  return null;
}
