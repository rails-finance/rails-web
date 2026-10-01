// LlamaLend lifetime flows by event type: the sums the position card's
// soft-liquidation figures read (what the AMM sold and did not buy back).
// ----------------------------------------------------------------------------
// The events' emitted deltas, bucketed by event type. ⚠️ The Liquidate-
// paired Repay is already deduped in the index, so nothing double-counts. The
// Lifetime flows panel replays the rows separately (lib/llamalend/flows.ts).

import type { LlamalendPositionView } from "@/components/protocol/llamalend/llamalend-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLlamalendEvent } from "@/lib/shared/types/event-shape";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-12;

export interface LifetimeFlows {
  collateralAdded: number;
  collateralWithdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
  collateralTaken: number;
  /** Already-converted borrowed token taken in hard liquidations — the AMM
   *  holding's other leg (the log's stablecoin_received), seized alongside
   *  the collateral. */
  convertedTaken: number;
}

export function replayLlamalendLifetime(events: BaseActivityEvent[]): LifetimeFlows {
  const f: LifetimeFlows = {
    collateralAdded: 0,
    collateralWithdrawn: 0,
    borrowed: 0,
    repaid: 0,
    liquidatedDebt: 0,
    collateralTaken: 0,
    convertedTaken: 0,
  };
  for (const ev of events) {
    if (!isLlamalendEvent(ev)) continue;
    const ctx = ev.context.data;
    const coll = Number(ctx.collateralDelta ?? "0");
    const debt = Number(ctx.debtDelta ?? "0");
    // A liquidator-side row narrates the subject ACTING on someone else's
    // position — not this position's own flows; it never buckets here.
    if (ctx.role === "liquidator") continue;
    if (ctx.eventType === "liquidation") {
      // Self-liquidations are a normal close: the debt clears as a repay and
      // the remaining collateral as a withdrawal; third-party liquidations
      // get the loss buckets.
      if (ctx.selfLiquidation || ctx.role === "self") {
        if (Number.isFinite(debt) && debt < 0) f.repaid += -debt;
        if (Number.isFinite(coll) && coll < 0) f.collateralWithdrawn += -coll;
      } else {
        if (Number.isFinite(debt) && debt !== 0) f.liquidatedDebt += Math.abs(debt);
        if (Number.isFinite(coll) && coll !== 0) f.collateralTaken += Math.abs(coll);
        // A hard liquidation seizes the AMM holding's OTHER leg too — the
        // already-converted borrowed token (stablecoin_received).
        const taken = Number(ctx.convertedTaken ?? "0");
        if (Number.isFinite(taken) && taken > 0) f.convertedTaken += taken;
      }
      continue;
    }
    if (Number.isFinite(coll) && coll !== 0) {
      if (coll > 0) f.collateralAdded += coll;
      else f.collateralWithdrawn += -coll;
    }
    if (Number.isFinite(debt) && debt !== 0) {
      if (debt > 0) f.borrowed += debt;
      else f.repaid += -debt;
    }
  }
  return f;
}

/** Which token each lifetime leg is denominated in. The summary's one flow
 *  bucket is keyed by controller and carries BOTH tokens, so its `decimals`
 *  is null by design and the merge scales each leg with the decimals the view
 *  already carries for the pair. */
const COLLATERAL_LEGS = new Set(["collateralAdded", "collateralWithdrawn", "collateralTaken"]);

/**
 * The lifetime flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation. The leg names are the LifetimeFlows fields verbatim
 * (rails-server's flowsSql restates replayLlamalendLifetime branch for
 * branch, self-liquidations and the liquidator-leg exclusion included), so
 * the merge needs no translation table. A leg that cannot be scaled returns
 * undefined for the WHOLE layer: a lifetime figure short by whatever the
 * summarised part held is a wrong answer, not a partial one.
 */
export function llamalendLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
  decimals: { collateral: number; borrowed: number },
): LifetimeFlows | undefined {
  if (!opening) return undefined;
  const f = replayLlamalendLifetime(events);
  for (const bucket of opening.flows ?? []) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in f)) continue;
      const value = scaleBaseUnits(raw, COLLATERAL_LEGS.has(leg) ? decimals.collateral : decimals.borrowed);
      if (value == null) return undefined;
      f[leg as keyof LifetimeFlows] += value;
    }
  }
  return f;
}

/**
 * Collateral the AMM sold and did not buy back over the position's life:
 * deposited − withdrawn − held now. Stated only where every other way out is
 * zero and the rest is known: an open position with the live read landed,
 * nothing converted at head (a converted balance still holds part of it as
 * the borrowed token), and no hard liquidation (which takes the converted
 * leg with it). A gap within the AMM's rounding is none.
 */
export function llamalendLostToSoftLiq(view: LlamalendPositionView, lifetime: LifetimeFlows | null | undefined) {
  if (!lifetime || view.status !== "open" || view.stateBasis !== "chain" || view.collateral == null) return null;
  if (view.converted == null || view.converted > DUST) return null;
  if (view.liquidationCount > 0 || lifetime.collateralTaken > DUST || lifetime.convertedTaken > DUST) return null;
  const gap = lifetime.collateralAdded - lifetime.collateralWithdrawn - view.collateral;
  if (gap <= Math.max(lifetime.collateralAdded * 1e-9, DUST)) return null;
  return gap;
}

/**
 * Collateral the AMM has sold net of buy-backs on a position in its bands now:
 * deposited − withdrawn − held. The converted balance at head is what it holds
 * for it. Stated only on an open position with the live read landed, something
 * converted, and no hard liquidation (which takes the converted leg with it).
 */
export function llamalendSoldInBands(view: LlamalendPositionView, lifetime: LifetimeFlows | null | undefined) {
  if (!lifetime || view.status !== "open" || view.stateBasis !== "chain" || view.collateral == null) return null;
  if (view.converted == null || view.converted <= DUST) return null;
  if (view.liquidationCount > 0 || lifetime.collateralTaken > DUST || lifetime.convertedTaken > DUST) return null;
  const gap = lifetime.collateralAdded - lifetime.collateralWithdrawn - view.collateral;
  if (gap <= Math.max(lifetime.collateralAdded * 1e-9, DUST)) return null;
  return gap;
}
