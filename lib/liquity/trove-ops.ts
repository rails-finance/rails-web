import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";

/** Display epsilon shared by the header labels, spine icons, and filter keys —
 *  deltas below this render as "no movement". */
export const TROVE_DELTA_EPSILON = 0.01;

/** Liquity V2's minimum trove debt. A repayment can never take debt below it
 *  (short of closing the trove), so automated repay attempts against a trove
 *  already at the floor clamp to the accrued-interest dust — the cause of the
 *  no-change event streams below. */
export const LIQUITY_MIN_DEBT = 2000;

/** An adjustTrove whose operation moved nothing — both the collateral and debt
 *  deltas are below the display epsilon. Automated managers (bots, vault
 *  contracts) emit these when the protocol clamps their requested operation to
 *  nothing — typically a repay against a trove pinned at the 2,000 BOLD
 *  minimum, where only accrued-interest dust is repayable (a wstETH trove
 *  streams one every few minutes). They carry no flows, so calling them
 *  "Adjust" would claim a change that never happened. Header, spine, filter,
 *  and explainer all route through this one predicate. */
export function isNoChangeAdjust(ctx: LiquityContext): boolean {
  if (ctx.operation !== "adjustTrove" || !ctx.troveOperation) return false;
  // A server-collapsed run IS a no-change event regardless of its summed
  // deltas — 1,400 dust repays can total more than the display epsilon.
  if (ctx.noChangeRun) return true;
  return (
    Math.abs(ctx.troveOperation.debtChangeFromOperation) < TROVE_DELTA_EPSILON &&
    Math.abs(ctx.troveOperation.collChangeFromOperation) < TROVE_DELTA_EPSILON
  );
}
