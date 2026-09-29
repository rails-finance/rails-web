// Figures an f(x) row derives from its read (lib/fx/use-event-state.ts), shared
// by the detail grid and the explainer so both state the same number.

import type { FxContext } from "@/lib/shared/types/event-shape";
import type { FxFeeSchedule } from "@/lib/sources/chain/fx-event-state";

export interface FxRowFee {
  /** Words after the ratio: "of the deposit". */
  leg: string;
  ratio: number;
  /** The fee in the leg's unit: collateral token or fxUSD. */
  amount: number;
  symbol: "token" | "fxUSD";
}

/** The fee on each leg this operate moved, from the caller's schedule
 *  (PoolManager `_handleSupply` / `_handleWithdraw` / `_handleBorrow` /
 *  `_handleRepay`). The event's collateral delta is what the pool credited, so
 *  a deposit's fee is credited × r ÷ (1 − r); a withdrawal pays r of the
 *  amount withdrawn; a borrow's fee comes out of the fxUSD minted; a repay
 *  burns r on top. */
export function fxRowFees(ctx: FxContext, fees: FxFeeSchedule): FxRowFee[] {
  const coll = Number(ctx.collDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  const out: FxRowFee[] = [];
  if (coll > 0 && fees.supply < 1)
    out.push({
      leg: "of the deposit",
      ratio: fees.supply,
      amount: (coll * fees.supply) / (1 - fees.supply),
      symbol: "token",
    });
  if (coll < 0)
    out.push({ leg: "of the withdrawal", ratio: fees.withdraw, amount: -coll * fees.withdraw, symbol: "token" });
  if (debt > 0) out.push({ leg: "of the borrow", ratio: fees.borrow, amount: debt * fees.borrow, symbol: "fxUSD" });
  if (debt < 0) out.push({ leg: "of the repayment", ratio: fees.repay, amount: -debt * fees.repay, symbol: "fxUSD" });
  return out;
}

/** "0.3%" from 0.003. */
export const fxFeePct = (r: number): string => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** A schedule in words: "0.8% of a borrow and 0.2% of a repayment", or
 *  "nothing". */
export function fxScheduleWords(s: { supply: number; withdraw: number; borrow: number; repay: number }): string {
  const parts = [
    s.supply > 0 ? `${fxFeePct(s.supply)} of a deposit` : null,
    s.withdraw > 0 ? `${fxFeePct(s.withdraw)} of a withdrawal` : null,
    s.borrow > 0 ? `${fxFeePct(s.borrow)} of a borrow` : null,
    s.repay > 0 ? `${fxFeePct(s.repay)} of a repayment` : null,
  ].filter((p): p is string => p != null);
  if (parts.length === 0) return "nothing";
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The amount below which a liquidation moved nothing: the site's display
 *  floor for an amount (formatTinyNonZero). */
const MOVED_FLOOR = 1e-6;

/** Whether a per-position liquidation took collateral or repaid debt. The
 *  manager also logs a LiquidatePosition for a keeper's call that reached a
 *  position with nothing left to take (wsteth-243, block 21,763,933: 0 and
 *  0); the position card does not count those. */
export function fxLiquidationMoved(ctx: FxContext): boolean {
  if (ctx.eventType !== "liquidation") return false;
  if (ctx.poolWide) return true;
  const colls = Number(ctx.liqColls ?? "0") || 0;
  const repaid = (Number(ctx.liqFxusdDebts ?? "0") || 0) + (Number(ctx.liqStableDebts ?? "0") || 0);
  return colls > 0 || repaid >= MOVED_FLOOR;
}

/** The card's liquidation-count rule, in the words its tip gives. */
export const FX_LIQUIDATION_RULE =
  "Counts the liquidations that took collateral or repaid debt; a keeper's call that found nothing left to take is on the timeline and not counted.";
