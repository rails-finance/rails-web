// A Liquity V2 event's safety figures, all at this event's oracle price
// (BRIEF 7.3: the event's price is the default for every value, ratio and
// liquidation price). Comparing the ratio before and after at one price
// separates the owner's act from the market's move; the market's move since
// the previous event is its own figure.
//
//   ratio            = collateral × price ÷ debt
//   liquidation price = debt × MCR ÷ collateral   (MCR: the branch constant,
//                                                  lib/liquity/asset-catalog.ts)

import type { BaseActivityEvent } from "@/lib/shared/types/activity";
import { isLiquityEvent } from "@/lib/shared/types/activity";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { RUNWAY_SHARE } from "@/lib/shared/market-note";
import { exactCollAfter, exactCollBefore, exactCollChange } from "@/lib/liquity/utils/interest-calculator";

export interface LiquityEventSafety {
  /** This event's oracle price (a liquidation's: the price it ran at). */
  price: number;
  collBefore: number;
  debtBefore: number;
  /** Collateral ratio before the event at this event's price, percent. */
  crBefore: number | null;
  /** Collateral ratio after the event, percent. */
  crAfter: number | null;
  /** The branch's minimum collateral ratio as a multiple (1.1 = 110%). */
  mcr: number;
  liqPriceBefore: number | null;
  liqPriceAfter: number | null;
  /** The previous event's price, where it has one. */
  prevPrice: number | null;
  /** The price's relative move since the previous event (−0.53 = −53%). */
  priceChange: number | null;
  /** The move consumed at least RUNWAY_SHARE of the trove's room above the
   *  minimum, as it stood before the move (lib/shared/market-note.ts). */
  priceMoveMaterial: boolean;
}

/** The branch's MCR as a multiple, or null on an unknown branch. */
export function branchMcr(collateralType: string | undefined): number | null {
  const key = (collateralType === "ETH" ? "WETH" : (collateralType ?? "")).toLowerCase();
  return LIQUITY_V2_BRANCHES[key]?.mcr ?? null;
}

/** The trove's collateral and debt before the event. Events that log only the
 *  after-state (a redemption, a liquidation, a close the index reset) are
 *  rebuilt from their operation. */
export function liquityBeforeAmounts(ctx: LiquityContext): { coll: number; debt: number } {
  const { stateBefore, stateAfter, troveOperation: op, liquidation } = ctx;
  if (ctx.operation === "liquidate" && liquidation) {
    return {
      debt: liquidation.debtOffsetBySP + liquidation.debtRedistributed,
      coll:
        liquidation.collSentToSP +
        liquidation.collRedistributed +
        liquidation.collSurplus +
        liquidation.collGasCompensation,
    };
  }
  const isRedemption =
    ctx.operation === "redeemCollateral" ||
    ctx.operation === "adjustZombieTrove" ||
    ctx.operation === "adjustUnredeemableZombieTrove";
  // The collateral at the log's precision: printed at the ledger's decimals,
  // as the ledger's replay reads it.
  if (isRedemption && op && stateAfter) {
    return {
      debt: stateAfter.debt + Math.abs(op.debtChangeFromOperation),
      coll: exactCollAfter(ctx) + Math.abs(exactCollChange(ctx)),
    };
  }
  if (ctx.operation === "closeTrove" && op && stateBefore && stateBefore.debt === 0 && stateBefore.coll === 0) {
    return { debt: Math.abs(op.debtChangeFromOperation), coll: Math.abs(exactCollChange(ctx)) };
  }
  return { coll: stateBefore ? exactCollBefore(ctx) : 0, debt: stateBefore?.debt ?? 0 };
}

export function liquityEventSafety(ctx: LiquityContext, previousEvent?: BaseActivityEvent): LiquityEventSafety {
  const price = ctx.operation === "liquidate" && ctx.liquidation ? ctx.liquidation.price : (ctx.collateralPrice ?? 0);
  const { coll: collBefore, debt: debtBefore } = liquityBeforeAmounts(ctx);
  const collAfter = exactCollAfter(ctx);
  const debtAfter = ctx.stateAfter?.debt ?? 0;
  const mcr = branchMcr(ctx.collateralType) ?? 0;
  const cr = (c: number, d: number) => (price > 0 && c > 0 && d > 0 ? ((c * price) / d) * 100 : null);
  const liq = (c: number, d: number) => (mcr > 0 && c > 0 && d > 0 ? (d * mcr) / c : null);

  const prevCtx = previousEvent && isLiquityEvent(previousEvent) ? previousEvent.context.data : undefined;
  const prevPrice = prevCtx && prevCtx.collateralPrice > 0 ? prevCtx.collateralPrice : null;
  const priceChange = prevPrice && price > 0 ? price / prevPrice - 1 : null;
  // The room the trove had above the minimum at the previous price.
  const crPrev = prevPrice && collBefore > 0 && debtBefore > 0 ? (collBefore * prevPrice) / debtBefore : null;
  const runway = crPrev && mcr > 0 ? 1 - mcr / crPrev : null;
  const priceMoveMaterial =
    priceChange != null && runway != null && runway > 0 ? Math.abs(priceChange) / runway >= RUNWAY_SHARE : false;

  return {
    price,
    collBefore,
    debtBefore,
    crBefore: cr(collBefore, debtBefore),
    crAfter: cr(collAfter, debtAfter),
    mcr,
    liqPriceBefore: liq(collBefore, debtBefore),
    liqPriceAfter: liq(collAfter, debtAfter),
    prevPrice,
    priceChange,
    priceMoveMaterial,
  };
}
