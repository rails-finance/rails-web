// The word T1 states for an Aave V4 row, which the phone spine view's caption,
// the event page's h1 and its browser title repeat. Server-safe: the event
// page's metadata reads it.

import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import { AAVE_V4_HEAD_WORDS as W } from "@/lib/aave-v4/event-templates";

/** Each event type's word. */
export const AAVE_V4_LABELS = {
  supply: "Supply",
  withdraw: "Withdraw",
  borrow: "Borrow",
  repay: "Repay",
  liquidation: "Liquidation",
  collateral_toggle: "Collateral Toggle",
} as const;

/** "Enable Supply" where the supply also enabled the collateral. */
export function aaveV4Label(ctx: AaveV4Context): string {
  if (ctx.alsoToggledCollateral) return "Enable Supply";
  if (ctx.eventType === "collateral_toggle") return ctx.enabled ? "Enable" : "Disable";
  return (AAVE_V4_LABELS as Record<string, string>)[ctx.eventType] ?? ctx.eventType;
}

/** The timeline head's words (rails-ops decision 0045, TO-DO-ui-jobs 367): the
 *  past-participle kind, and a supply that also turned the reserve on as
 *  collateral names both in order ("Supplied · Enabled as collateral"). The
 *  spine carries the figures. */
export function aaveV4T1Kind(ctx: AaveV4Context): string {
  if (ctx.alsoToggledCollateral) return `${W.supplied} ${W.sep} ${W.enabled}`;
  switch (ctx.eventType) {
    case "supply":
      return W.supplied;
    case "withdraw":
      return W.withdrew;
    case "borrow":
      return W.borrowed;
    case "repay":
      return W.repaid;
    case "liquidation":
      return W.liquidated;
    case "collateral_toggle":
      return ctx.enabled ? W.enabled : W.disabled;
    default:
      return aaveV4Label(ctx);
  }
}
