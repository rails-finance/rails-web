// Liquity V1: a Trove life's redemptions, summed from its rows — the
// redemption outcome beside the Lifetime flows panel's heading and in the
// closed life's Explanation. The panel's flows are lib/liquity-v1/flows.ts.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import { redemptionSplit } from "@/lib/liquity-v1/event-figures";

/** A Trove life's redemptions, from the rows that carry a price: the LUSD the
 *  redeemers paid in, the ETH they took, and that ETH's value at each
 *  redemption's PriceFeed price. Null when there were none, or when a row is
 *  unpriced (a partial sum would state the wrong outcome). */
export interface LiquityV1RedemptionTotals {
  count: number;
  lusdRedeemed: number;
  ethTaken: number;
  ethValueAtRedemption: number;
  /** Reserves burned by full redemptions (LUSD). */
  reserveBurned: number;
}

export function liquityV1RedemptionTotals(
  events: BaseActivityEvent[] | undefined,
  epoch: number | null,
): LiquityV1RedemptionTotals | null {
  if (!events) return null;
  const t: LiquityV1RedemptionTotals = {
    count: 0,
    lusdRedeemed: 0,
    ethTaken: 0,
    ethValueAtRedemption: 0,
    reserveBurned: 0,
  };
  for (const ev of events) {
    if (!isLiquityV1Event(ev)) continue;
    const ctx = ev.context.data;
    if (ctx.eventType !== "redemption") continue;
    if (epoch != null && ctx.epoch != null && ctx.epoch !== epoch) continue;
    const split = redemptionSplit(ctx);
    if (!split) return null;
    t.count += 1;
    t.lusdRedeemed += split.lusdRedeemed;
    t.ethTaken += split.ethToRedeemer;
    t.ethValueAtRedemption += split.ethToRedeemer * split.price;
    t.reserveBurned += split.reserveBurned;
  }
  return t.count > 0 ? t : null;
}
