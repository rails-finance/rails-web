// Liquity V1 per-event figures shared by the card's header, its opened grid,
// its explanation and the lifetime flows — one place for the arithmetic, so the
// four agree to the figure.
//
// Display: a before and an after are formatted from the captured decimal
// strings at fixed places (ETH 4, LUSD 2), so the before on one card equals the
// after on the card below it. The float `after − change` the shared grid used
// to draw (90,650.00000000001) never reaches a V1 card.
//
// A full redemption (the Trove's debt goes to zero): the redeemer's LUSD
// cancels the debt less the 200 LUSD reserve, and takes ETH worth that at the
// PriceFeed price (TroveManager._redeemCollateralFromTrove); the GasPool burns
// the reserve, and the rest of the ETH moves to the CollSurplusPool for the
// owner (_redeemCloseTrove).

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";

/** LUSD_GAS_COMPENSATION: the reserve every Trove's debt carries. */
export const LIQUITY_V1_RESERVE = 200;
/** A figure below this reads as zero. */
const EPS = 1e-9;

const num = (s?: string | null): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const fmtEth = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
export const fmtLusd = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtUsd = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtUsdSigned = (n: number): string => `${n >= 0 ? "+" : "−"}${fmtUsd(Math.abs(n))}`;
export const fmtPct = (ratio: number, dp = 2): string =>
  `${(ratio * 100).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}%`;

export interface LiquityV1Sides {
  collBefore: number;
  collAfter: number;
  debtBefore: number;
  debtAfter: number;
  collDelta: number;
  debtDelta: number;
}

export function sidesOf(ctx: LiquityV1Context): LiquityV1Sides {
  return {
    collBefore: num(ctx.collBefore),
    collAfter: num(ctx.collAfter),
    debtBefore: num(ctx.debtBefore),
    debtAfter: num(ctx.debtAfter),
    collDelta: num(ctx.collDelta),
    debtDelta: num(ctx.debtDelta),
  };
}

/** Collateral ratio (coll × price ÷ debt); null with no debt or no price. */
export const ratioOf = (coll: number, debt: number, price: number | null | undefined): number | null =>
  price != null && price > 0 && debt > EPS ? (coll * price) / debt : null;

export interface LiquityV1RedemptionSplit {
  /** The redemption closed the Trove. */
  full: boolean;
  /** LUSD the redeemer paid in: the debt cancelled less the reserve on a full
   *  redemption. */
  lusdRedeemed: number;
  /** ETH that went to the redeemer. */
  ethToRedeemer: number;
  /** ETH left to the owner in the CollSurplusPool (full redemption only). */
  ethSurplus: number;
  /** The reserve the GasPool burned (full redemption only). */
  reserveBurned: number;
  price: number;
}

/** How a redemption's collateral and debt divide; null when the row carries
 *  no price or is not a redemption. */
export function redemptionSplit(ctx: LiquityV1Context): LiquityV1RedemptionSplit | null {
  if (ctx.eventType !== "redemption") return null;
  const price = ctx.priceAtBlock?.usd;
  if (price == null || !(price > 0)) return null;
  const s = sidesOf(ctx);
  const collTaken = Math.abs(Math.min(s.collDelta, 0));
  const debtCancelled = Math.abs(Math.min(s.debtDelta, 0));
  const full = s.debtAfter <= EPS;
  if (!full) {
    return { full, lusdRedeemed: debtCancelled, ethToRedeemer: collTaken, ethSurplus: 0, reserveBurned: 0, price };
  }
  const lusdRedeemed = Math.max(0, debtCancelled - LIQUITY_V1_RESERVE);
  const ethToRedeemer = Math.min(collTaken, lusdRedeemed / price);
  return {
    full,
    lusdRedeemed,
    ethToRedeemer,
    ethSurplus: Math.max(0, collTaken - ethToRedeemer),
    reserveBurned: LIQUITY_V1_RESERVE,
    price,
  };
}

/** The adjust kinds a V1 adjustment can combine; the learn-more modal and the
 *  copy pick from them. */
export type LiquityV1AdjustKind = "add" | "withdraw" | "borrow" | "repay";

export function adjustKinds(ctx: LiquityV1Context): LiquityV1AdjustKind[] {
  const s = sidesOf(ctx);
  const out: LiquityV1AdjustKind[] = [];
  if (s.collDelta > EPS) out.push("add");
  if (s.collDelta < -EPS) out.push("withdraw");
  if (s.debtDelta > EPS) out.push("borrow");
  if (s.debtDelta < -EPS) out.push("repay");
  return out;
}
