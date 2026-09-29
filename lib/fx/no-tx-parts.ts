// What moved an f(x) position's debt without its owner's transaction, part by
// part: the rows the timeline places on its history (rebalances, redemptions,
// pool-wide liquidations), each read as getPosition at block − 1 and at the
// block; the debt a liquidation of the position left unpaid (its row's
// before less what the keeper repaid less its after); and the remainder,
// other positions' bad debt that the pool added through its debt index.
//
//   implied − settled = rebalances + redemptions + pool-wide liquidations
//                       + left unpaid at its liquidations − bad debt added
//
// One set of figures for the card's debt line, its Explanation, the Lifetime
// flows segment and its tip, so the four name the same parts.
//
// The bonus: what the rebalances and redemptions took in collateral, valued at
// the oracle's min price at the block before each (the price a rebalance is
// judged and paid at, BasePool.rebalance), less the debt they cleared. A
// rebalance pays the keeper the pool's rebalance bonus on top of the debt, so
// this is what the owner paid for being rebalanced.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import { fxBlockChange } from "@/lib/fx/socialized-reads";

export interface FxNoTxPart {
  /** Collateral taken (normalized units, positive) and debt cleared (fxUSD,
   *  positive), summed over the part's blocks. */
  coll: number;
  debt: number;
  rows: number;
  firstTs: number;
  lastTs: number;
  /** Pool-wide liquidations: what their keepers repaid across the whole pool
   *  (the Liquidate logs' fxUSD); the rest of the position's debt that left
   *  was written off. */
  poolRepaid?: number;
}

export interface FxNoTxParts {
  rebalances: FxNoTxPart | null;
  redemptions: FxNoTxPart | null;
  poolLiquidations: FxNoTxPart | null;
  /** fxUSD left unpaid at the position's own liquidations and added to the
   *  other positions' debt. */
  leftUnpaid: number;
  /** Other positions' bad debt added to this one (fxUSD; negative would mean
   *  the parts overstate the gap, which the card then does not split). */
  badDebt: number;
  /** Rebalances and redemptions: collateral valued at the min price of the
   *  block before each, less the debt they cleared. Null until the prices
   *  are in. */
  bonus: { collUsd: number; debt: number; coll: number } | null;
}

type Kind = "rebalance" | "redemption" | "poolLiquidation";

const WAD = 1e18;

/** Null until every block has read, where a block also holds one of the
 *  position's own events (its read would mix the two), or where the gap is
 *  unknown. */
export function fxNoTxParts(
  events: BaseActivityEvent[],
  reads: Record<string, FxStateAt> | null | undefined,
  gap: number | null,
): FxNoTxParts | null {
  if (!reads || gap == null) return null;
  const fx = events.filter(isFxEvent);
  const ownBlocks = new Set<number>();
  let leftUnpaid = 0;
  for (const e of fx) {
    const d = e.context.data;
    const own = d.eventType === "operate" || (d.eventType === "liquidation" && !d.poolWide);
    if (own) ownBlocks.add(e.blockNumber);
    if (d.eventType === "liquidation" && !d.poolWide && d.debtBefore != null && d.debtAfter != null) {
      const repaid = (Number(d.liqFxusdDebts ?? "0") || 0) + (Number(d.liqStableDebts ?? "0") || 0);
      const unpaid = Number(d.debtBefore) - repaid - Number(d.debtAfter);
      if (unpaid > 0.001) leftUnpaid += unpaid;
    }
  }
  const kindOf = new Map<number, { kind: Kind; ts: number }>();
  for (const e of fx) {
    const d = e.context.data;
    const kind: Kind | null =
      d.eventType === "liquidation" && d.poolWide
        ? "poolLiquidation"
        : d.eventType === "tickRebalance"
          ? d.redemption
            ? "redemption"
            : "rebalance"
          : null;
    if (!kind) continue;
    const prev = kindOf.get(e.blockNumber);
    // A pool-wide liquidation names its block; otherwise a block of
    // redemptions only is a redemption block.
    if (!prev || kind === "poolLiquidation" || (prev.kind === "redemption" && kind === "rebalance"))
      kindOf.set(e.blockNumber, { kind, ts: e.timestamp });
  }
  if (kindOf.size === 0) return null;
  let poolRepaid = 0;
  for (const e of fx) {
    const d = e.context.data;
    if (d.eventType === "liquidation" && d.poolWide) poolRepaid += Number(d.tickRebFxusdDebts ?? "0") || 0;
  }
  const parts: Record<Kind, FxNoTxPart | null> = { rebalance: null, redemption: null, poolLiquidation: null };
  let collUsd = 0;
  let bonusDebt = 0;
  let bonusColl = 0;
  let priced = true;
  for (const [block, { kind, ts }] of kindOf) {
    if (ownBlocks.has(block)) return null;
    const c = fxBlockChange(reads, block);
    if (!c) return null;
    const p = (parts[kind] ??= { coll: 0, debt: 0, rows: 0, firstTs: ts, lastTs: ts });
    p.coll += -c.coll;
    p.debt += -c.debt;
    p.rows += 1;
    p.firstTs = Math.min(p.firstTs, ts);
    p.lastTs = Math.max(p.lastTs, ts);
    if (kind !== "poolLiquidation") {
      const min = reads[String(block - 1)]?.minPrice;
      if (min == null) priced = false;
      else collUsd += -c.coll * (Number(min) / WAD);
      bonusDebt += -c.debt;
      bonusColl += -c.coll;
    }
  }
  if (parts.poolLiquidation) parts.poolLiquidation.poolRepaid = poolRepaid;
  const cleared = (parts.rebalance?.debt ?? 0) + (parts.redemption?.debt ?? 0) + (parts.poolLiquidation?.debt ?? 0);
  return {
    rebalances: parts.rebalance,
    redemptions: parts.redemption,
    poolLiquidations: parts.poolLiquidation,
    leftUnpaid,
    badDebt: cleared + leftUnpaid - gap,
    bonus: priced && bonusColl > 0 ? { collUsd, debt: bonusDebt, coll: bonusColl } : null,
  };
}
