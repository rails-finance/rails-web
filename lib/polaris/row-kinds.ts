// What a Polaris adjust row did, in the words its row shows. One CDPUpdated
// adjust can deposit or withdraw, borrow or repay, and carry the market's net
// PSM share, all in one touch; the row names each leg ("Deposit", "Borrow",
// "Net PSM share"), so the Types filter keys an adjust by the same words
// rather than by "Adjust", which no row reads.

import type { PolarisContext } from "@/lib/shared/types/event-shape";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The row's leg names, in the order the row draws them — the holder's
 *  collateral verb, the holder's debt verb, then the PSM share. Empty on a
 *  touch that moved nothing. */
export function polarisAdjustKinds(
  ctx: Pick<PolarisContext, "collChange" | "debtChange" | "mintRedeemCollGain" | "mintRedeemDebtGain">,
): string[] {
  const kinds: string[] = [];
  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  if (dColl !== 0) kinds.push(dColl > 0 ? "Deposit" : "Withdraw");
  if (dDebt !== 0) kinds.push(dDebt > 0 ? "Borrow" : "Repay");
  if (num(ctx.mintRedeemCollGain) !== 0 || num(ctx.mintRedeemDebtGain) !== 0) kinds.push("Net PSM share");
  return kinds;
}

/** The Types filter's key for a Polaris row: an adjust's leg names joined
 *  ("Deposit, Borrow, Net PSM share"), which is also its label; every other
 *  row keeps its event type. */
export function polarisFilterKey(ctx: PolarisContext): string {
  if (ctx.eventType !== "adjust") return ctx.eventType;
  const kinds = polarisAdjustKinds(ctx);
  return kinds.length > 0 ? kinds.join(", ") : "adjust";
}
