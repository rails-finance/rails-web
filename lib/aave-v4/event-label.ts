// The word T1 states for an Aave V4 row, which the phone spine view's caption,
// the event page's h1 and its browser title repeat. Server-safe: the event
// page's metadata reads it.

import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";

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
