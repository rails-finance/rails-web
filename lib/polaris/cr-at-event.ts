// Polaris collateral ratio at the event, computed once for every surface.
// ----------------------------------------------------------------------------
// The header chip, the detail metric and the markdown export all read THIS
// function, so no surface can state a different figure for the same row.
//
// A touch (open / adjust / close) states `_newColl × previewPrice() ÷ _newDebt`
// on a row the oracle-at-block lane has priced and whose resulting debt is
// above zero: the formula the price-gap market note already applies
// (lib/shared/market-note.ts). The touch has just written the pending
// interest and PSM share in, so the two figures are the CDP's own at that
// moment; the price is the feed's end-of-block value.
//
// A liquidation row has `_newDebt = 0`, so the formula has no answer there.
// The row states the ratio AT FIRE the forensics already compute, the ENTIRE
// seized collateral over the debt cleared (polarisLiquidationFigures), so
// the chip, the metric and the forensics line agree to the digit.
//
// A row without a price, or a close (no resulting debt), carries no ratio:
// the caller draws a dash (the metric) or nothing (the chip).

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import type { Provenance } from "@/components/shared/provenance";
import {
  POLARIS_LIQ_CONSTANTS,
  polarisLiquidationFigures,
} from "@/components/protocol/polaris/polaris-liquidation-forensics";
import { crAtEventProv, liqIcrAtFireProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatExact } from "@/lib/utils/format";

/** The market's NORMAL-MODE minimum, as a percentage. A defensive-mode
 *  minimum (150%) in force at a past block is not indexed, so every row
 *  compares against this one and its receipt says so. Same figure the
 *  forensics name (POLARIS_LIQ_CONSTANTS.mcr). */
export const POLARIS_NORMAL_MCR_PCT = 115;

export interface PolarisCrAtEvent {
  /** The ratio as a percentage (133.87 means 133.87%). */
  pct: number;
  /** Below the market's normal-mode minimum. */
  belowMin: boolean;
  /** Which fact this is: the formula on a touch's resulting figures, or the
   *  forensics' ratio at fire on a liquidation. */
  source: "formula" | "at-fire";
  /** The same ratio on the CDP's figures BEFORE this touch, at this block's
   *  price. Undefined on the open (no debt before), on a liquidation, and
   *  wherever the lag columns are missing. */
  beforePct?: number;
  /** pETH in the market's own unit at this block. */
  price: number;
}

const num = (s?: string): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The collateral ratio this row states, or undefined where it cannot carry
 *  one (no at-block price, no resulting debt, a transfer). */
export function polarisCrAtEvent(ctx: PolarisContext): PolarisCrAtEvent | undefined {
  if (ctx.eventType === "transfer") return undefined;
  const price = ctx.priceAtBlock?.pethInDebt;
  if (price == null || !Number.isFinite(price) || price <= 0) return undefined;

  if (ctx.eventType === "liquidate") {
    const f = polarisLiquidationFigures(ctx);
    if (!f || !Number.isFinite(f.icrAtFire)) return undefined;
    const pct = f.icrAtFire * 100;
    return { pct, belowMin: pct < POLARIS_NORMAL_MCR_PCT, source: "at-fire", price };
  }

  const newColl = num(ctx.newColl);
  const newDebt = num(ctx.newDebt);
  if (newColl == null || newDebt == null || newDebt <= 0) return undefined;
  const pct = ((newColl * price) / newDebt) * 100;

  const collBefore = num(ctx.collBefore);
  const debtBefore = num(ctx.debtBefore);
  const beforePct =
    collBefore != null && debtBefore != null && debtBefore > 0 ? ((collBefore * price) / debtBefore) * 100 : undefined;

  return { pct, belowMin: pct < POLARIS_NORMAL_MCR_PCT, source: "formula", beforePct, price };
}

/** The metric's own precision: one decimal on the page. */
export const crPct1 = (pct: number): string => `${pct.toFixed(1)}%`;
/** Two decimals: the receipt's value key, and the export's precision for
 *  every ratio it states (the same key the explainer's ratio at fire
 *  registers, so the three surfaces of a liquidation share one receipt). */
export const crPct2 = (pct: number): string => `${pct.toFixed(2)}%`;
/** The header chip: whole percent, the V2 chip's precision. */
export const crChipText = (pct: number): string => `${Math.round(pct)}% CR`;

/** The receipt behind the ratio and the value key it registers under, built
 *  once so the header chip (an echo) and the detail metric (the primary) name
 *  the same identity. A liquidation row's receipt is the forensics' own
 *  `liqIcrAtFireProv`, with the values the explainer clause passes. */
export function polarisCrReceipt(
  ctx: PolarisContext,
  coords: PolarisCoords,
  cr: PolarisCrAtEvent,
): { info: Provenance; value: string } {
  const stable = POLARIS_MARKET_CONFIG[ctx.market].stable.symbol;
  const value = crPct2(cr.pct);
  if (cr.source === "at-fire") {
    const f = polarisLiquidationFigures(ctx);
    return {
      info: liqIcrAtFireProv(coords, {
        seized: `${formatExact(Number(ctx.collLiquidated ?? "0"))} ${PETH.symbol}`,
        priceInDebt: `${formatExact(cr.price)} ${stable}`,
        cleared: `${formatExact(f?.cleared ?? 0)} ${stable}`,
        mcrPct: POLARIS_LIQ_CONSTANTS.mcr.label,
      }),
      value,
    };
  }
  return {
    info: crAtEventProv(coords, {
      newColl: `${formatExact(Number(ctx.newColl ?? "0"))} ${PETH.symbol}`,
      priceInDebt: `${formatExact(cr.price)} ${stable}`,
      newDebt: `${formatExact(Number(ctx.newDebt ?? "0"))} ${stable}`,
      mcrPct: POLARIS_LIQ_CONSTANTS.mcr.label,
    }),
    value,
  };
}
