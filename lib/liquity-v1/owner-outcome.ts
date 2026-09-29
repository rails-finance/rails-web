// What a liquidated Trove life left its owner, from the page's own rows and
// their receipt reads: the LUSD the owner received over the life less what the
// owner repaid, the ETH the owner withdrew, the ETH redemptions took, and the
// ETH the liquidation took with its value at the liquidation price. Where the
// owner's last act before the liquidation took the ratio to within a few points
// of 110% and the price barely moved before the liquidation, both ratios are
// carried so the copy can set them side by side.
//
// Stated only when every draw's receipt read landed: the LUSD received is the
// receipt's mint to the owner (the debt added less the fee and the reserve),
// and a partial sum would state the wrong figure.

import type { BaseActivityEvent, LiquityV1Context } from "@/lib/shared/types/event-shape";
import type { LiquityV1EventRead, LiquityV1LiquidationRead } from "@/lib/sources/chain/liquity-v1-event";
import {
  adjustKinds,
  ratioOf,
  redemptionSplit,
  sidesOf,
  type LiquityV1AdjustKind,
} from "@/lib/liquity-v1/event-figures";

type V1Row = BaseActivityEvent & { context: { protocol: "liquity-v1"; data: LiquityV1Context } };

/** A ratio within this of the 110% minimum reads as "at the line". */
const NEAR_LINE = 0.05;
/** A price move below this between the owner's act and the liquidation reads
 *  as "nearly the same price". */
const NEAR_PRICE = 0.05;
const EPS = 1e-9;

export interface LiquityV1NearLine {
  /** What the owner's last act did: a withdrawal, a borrow, or both. */
  kinds: LiquityV1AdjustKind[];
  timestamp: number;
  /** The ratio that act left, at its block's PriceFeed price. */
  ratioAfter: number;
  /** The ratio at liquidation. */
  liquidationRatio: number;
  liquidationTimestamp: number;
}

export interface LiquityV1OwnerOutcome {
  lusdReceived: number;
  lusdRepaid: number;
  ethWithdrawn: number;
  /** ETH redemptions took from the Trove over the life. */
  ethRedeemed: number;
  ethLost: number;
  liquidationPrice: number;
  /** The Trove's collateral ratio at liquidation, at that price. */
  liquidationRatio: number | null;
  liquidationTimestamp: number;
  /** The liquidation's receipt: where the debt and ETH went. */
  route: LiquityV1LiquidationRead | null;
  nearLine: LiquityV1NearLine | null;
}

/** The transactions whose receipts the outcome needs: every draw (open or
 *  borrow), the owner's last act before the liquidation, and the liquidation. */
export function liquityV1OutcomeTxs(rows: readonly V1Row[]): string[] {
  const liqIdx = rows.findIndex((r) => r.context.data.eventType === "liquidation");
  if (liqIdx < 0) return [];
  const out = new Set<string>();
  rows.slice(0, liqIdx).forEach((r) => {
    const s = sidesOf(r.context.data);
    const owner = r.context.data.eventType === "openTrove" || r.context.data.eventType === "adjustTrove";
    if (owner && s.debtDelta > EPS && r.txHash) out.add(r.txHash);
  });
  const last = lastOwnerAct(rows.slice(0, liqIdx));
  if (last?.txHash) out.add(last.txHash);
  if (rows[liqIdx].txHash) out.add(rows[liqIdx].txHash as string);
  return [...out];
}

function lastOwnerAct(rows: readonly V1Row[]): V1Row | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const t = rows[i].context.data.eventType;
    if (t === "openTrove" || t === "adjustTrove" || t === "closeTrove") return rows[i];
  }
  return null;
}

/** The outcome, or null while a read is missing or the life has no
 *  liquidation. `rows` is one Trove life, oldest first. */
export function liquityV1OwnerOutcome(
  rows: readonly V1Row[],
  reads: Map<string, LiquityV1EventRead> | null,
): LiquityV1OwnerOutcome | null {
  if (!reads) return null;
  const liqIdx = rows.findIndex((r) => r.context.data.eventType === "liquidation");
  if (liqIdx < 0) return null;
  const liq = rows[liqIdx];
  const liqCtx = liq.context.data;
  const liquidationPrice = liqCtx.priceAtBlock?.usd ?? reads.get(liq.txHash ?? "")?.priceUsd ?? null;
  if (liquidationPrice == null || !(liquidationPrice > 0)) return null;

  let lusdReceived = 0;
  let lusdRepaid = 0;
  let ethWithdrawn = 0;
  let ethRedeemed = 0;
  for (const r of rows.slice(0, liqIdx)) {
    const ctx = r.context.data;
    const s = sidesOf(ctx);
    if (ctx.eventType === "redemption") {
      const split = redemptionSplit(ctx);
      ethRedeemed += split ? split.ethToRedeemer : Math.abs(Math.min(s.collDelta, 0));
      continue;
    }
    if (ctx.eventType !== "openTrove" && ctx.eventType !== "adjustTrove") continue;
    if (s.collDelta < -EPS) ethWithdrawn += -s.collDelta;
    if (s.debtDelta < -EPS) lusdRepaid += -s.debtDelta;
    if (s.debtDelta > EPS) {
      const read = r.txHash ? reads.get(r.txHash) : undefined;
      if (!read) return null;
      lusdReceived += Number(read.lusdMintedToOwner);
    }
  }

  const liqSides = sidesOf(liqCtx);
  const liquidationRatio = ratioOf(liqSides.collBefore, liqSides.debtBefore, liquidationPrice);

  let nearLine: LiquityV1NearLine | null = null;
  const last = lastOwnerAct(rows.slice(0, liqIdx));
  if (last && liquidationRatio != null && last.txHash) {
    const kinds = adjustKinds(last.context.data).filter((k) => k === "withdraw" || k === "borrow");
    const lastPrice = reads.get(last.txHash)?.priceUsd ?? null;
    const s = sidesOf(last.context.data);
    const ratioAfter = ratioOf(s.collAfter, s.debtAfter, lastPrice);
    if (
      kinds.length > 0 &&
      lastPrice != null &&
      ratioAfter != null &&
      ratioAfter - 1.1 < NEAR_LINE &&
      Math.abs(liquidationPrice / lastPrice - 1) < NEAR_PRICE
    )
      nearLine = {
        kinds,
        timestamp: last.timestamp,
        ratioAfter,
        liquidationRatio,
        liquidationTimestamp: liq.timestamp,
      };
  }

  return {
    lusdReceived,
    lusdRepaid,
    ethWithdrawn,
    ethRedeemed,
    ethLost: liqSides.collBefore,
    liquidationPrice,
    liquidationRatio,
    liquidationTimestamp: liq.timestamp,
    route: reads.get(liq.txHash ?? "")?.liquidation ?? null,
    nearLine,
  };
}
