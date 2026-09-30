// What a Comet row did to the account, read from its own after-balance and
// amount: the balance before it (exact, from the decimal strings), what a base
// row did on each side of zero, and — on an absorb — the debt it cleared and
// the credit it left past it. One place, so the row's label, its figures and
// its prose all say the same thing.

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { decimalSub, formatNumber } from "@/lib/utils/format";

/** The smaller of two plain decimals, exact. */
function decimalMin(a: string, b: string): string {
  const d = decimalSub(a, b);
  return d != null && d.startsWith("-") ? a : b;
}

const isNeg = (s: string) => s.startsWith("-") && !/^-0(\.0*)?$/.test(s);
const isPos = (s: string) => !s.startsWith("-") && !/^0(\.0*)?$/.test(s);

export interface CompoundAbsorbSplit {
  /** basePaidOut, the balance change the event states. */
  paidOut: string;
  /** The signed base balance before the absorb. */
  before: string;
  /** The debt the absorb cleared (≥ 0). */
  cleared: string;
  /** The credit past the debt, left as a lent balance (≥ 0). */
  credit: string;
}

/** An absorb_debt row's basePaidOut, split at zero. Null off an absorb_debt
 *  row, or where the row carries no after-balance. */
export function compoundAbsorbSplit(ctx: CompoundContext): CompoundAbsorbSplit | null {
  if (ctx.eventType !== "absorb_debt" || ctx.baseAfter == null) return null;
  const paidOut = ctx.assetsDelta.replace(/^-/, "");
  const before = decimalSub(ctx.baseAfter, paidOut);
  if (before == null) return null;
  const owed = isNeg(before) ? before.slice(1) : "0";
  const cleared = decimalMin(paidOut, owed);
  const credit = decimalSub(paidOut, cleared) ?? "0";
  return { paidOut, before, cleared, credit };
}

/** The row's label by what the base balance did — Comet has no borrow or
 *  repay call, so a Withdraw past zero is the borrow and a Supply into debt
 *  is the repayment. A row that crosses zero names both. Collateral and
 *  transfer rows keep the label they came with. */
export function compoundRowLabel(ctx: CompoundContext, fallback: string): string {
  if ((ctx.eventType !== "supply" && ctx.eventType !== "withdraw") || ctx.baseAfter == null) return fallback;
  const before = decimalSub(ctx.baseAfter, ctx.assetsDelta);
  if (before == null) return fallback;
  const after = ctx.baseAfter;
  if (ctx.eventType === "supply") {
    if (!isNeg(before)) return "Supply";
    return isPos(after) ? "Repay and lend" : "Repay";
  }
  if (!isPos(before)) return "Borrow";
  return isNeg(after) ? "Withdraw and borrow" : "Withdraw";
}

/** The base-balance caption for a row's before → after: which side of zero
 *  the balance stood on, or "Base balance" where the row crossed it. */
export function compoundBaseCaption(before: string | null, after: string): string {
  if (before == null) return isNeg(after) ? "Borrowed (base)" : "Lent (base)";
  const neg = isNeg(before) || isNeg(after);
  const pos = isPos(before) || isPos(after);
  if (neg && pos) return "Base balance";
  return neg ? "Borrowed (base)" : "Lent (base)";
}

/** One precision for a row's moved amount wherever it is printed — the row's
 *  spine, its state grid and its prose: four decimals below one, three above
 *  (the spine's own compact form keeps two past 1,000). */
export function compoundAmount(n: number): string {
  const a = Math.abs(n);
  if (a > 0 && a < 1) {
    const s = parseFloat(a.toFixed(4)).toString();
    if (parseFloat(s) !== 0) return `${n < 0 ? "-" : ""}${s}`;
  }
  return formatNumber(n);
}
