"use client";

// Liquity V1 event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. A Trove event moves BOTH axes at once (ETH collateral + LUSD debt), so the
// row can carry two signed deltas. Each delta is after − before over two emitted
// absolutes (chain-derived); traced via <Prov>. No USD, no collateral ratio — layers.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  collDeltaProv,
  debtDeltaProv,
  closeRepaidProv,
  redemptionLegProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL, LIQUITY_V1_ADDRESSES } from "@/lib/liquity-v1/asset-catalog";
import {
  LIQUIDATION_COLL_VERB,
  LIQUIDATION_DEBT_VERB,
  LIQUITY_V1_RESERVE,
  redemptionSplit,
} from "@/lib/liquity-v1/event-figures";
import { COLL_VERB, DEBT_VERB } from "@/lib/shared/liquity-fork-ops";

export interface LiquityV1EventHeaderProps {
  actionLabel: string;
  ctx: LiquityV1Context;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
}

export function LiquityV1EventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
}: LiquityV1EventHeaderProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber };
  const deltas: ChainTruthDelta[] = [];

  // A redemption borrows the V2 grammar: collateral "Cleared", debt "Reduced",
  // both in the external-party pink, magnitudes only (the labels carry direction) —
  // and the action name rides the spine's REDEMPTION pill, not the row label.
  const isRedemption = ctx.eventType === "redemption";

  // Opens + owner adjusts get V2's per-axis grammar: each axis its own imperative
  // verb (Add/Withdraw ETH, Borrow/Repay LUSD) — the SAME classification the CSV
  // label uses (forkAdjustLabel), so the split can't disagree with the export. No
  // rate pill: V1 has no user-set rate, and that absence is the fact about V1.
  const isOpen = ctx.eventType === "openTrove";
  const isAdjust = ctx.eventType === "adjustTrove";
  const perAxis = isOpen || isAdjust;

  // A liquidation names what happened to each side: the ETH was seized, the
  // debt cleared. A full redemption splits the collateral: the redeemer's
  // ETH is "Cleared", the rest moved to the CollSurplusPool for the owner.
  const isLiq = ctx.eventType === "liquidation";
  const split = redemptionSplit(ctx);
  const coll = Number(ctx.collDelta) || 0;
  if (coll !== 0 && split?.full) {
    const legVals = { debt: String(split.lusdRedeemed), priceUsd: split.price, coll: ctx.collBefore };
    deltas.push({
      value: -split.ethToRedeemer,
      symbol: COLLATERAL_SYMBOL,
      prov: redemptionLegProv(coords, "redeemer", legVals),
      label: "Cleared",
      tone: "external",
    });
    if (split.ethSurplus > 0)
      deltas.push({
        value: split.ethSurplus,
        symbol: COLLATERAL_SYMBOL,
        prov: redemptionLegProv(coords, "surplus", legVals),
        label: "Surplus",
      });
  } else if (coll !== 0)
    deltas.push({
      value: coll,
      symbol: COLLATERAL_SYMBOL,
      // Operand values ride into the receipt: the emitted after, and the
      // previous event's value it was diffed against (after − delta).
      prov: collDeltaProv(coords, {
        after: ctx.collAfter,
        before: ctx.collAfter != null ? Number(ctx.collAfter) - coll : null,
      }),
      ...(isRedemption
        ? { label: "Cleared", tone: "external" as const }
        : isLiq
          ? { label: LIQUIDATION_COLL_VERB, tone: "caution" as const }
          : perAxis
            ? { label: coll > 0 ? COLL_VERB.add : COLL_VERB.withdraw, axisVerb: true }
            : {}),
    });

  const debt = Number(ctx.debtDelta) || 0;
  // A close takes the debt less the 200 LUSD reserve from the owner's wallet;
  // the GasPool burns the reserve.
  const isClose = ctx.eventType === "closeTrove";
  if (debt !== 0 && isClose) {
    const repaid = Math.max(0, Math.abs(debt) - LIQUITY_V1_RESERVE);
    deltas.push({
      value: -repaid,
      symbol: DEBT_SYMBOL,
      address: LIQUITY_V1_ADDRESSES.LUSD,
      prov: closeRepaidProv(coords, ctx.debtBefore),
    });
  } else if (debt !== 0)
    deltas.push({
      value: debt,
      symbol: DEBT_SYMBOL,
      address: LIQUITY_V1_ADDRESSES.LUSD,
      prov: debtDeltaProv(coords, {
        after: ctx.debtAfter,
        before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debt : null,
      }),
      ...(isRedemption
        ? { label: "Reduced", tone: "external" as const }
        : isLiq
          ? { label: LIQUIDATION_DEBT_VERB, tone: "caution" as const }
          : perAxis
            ? { label: debt > 0 ? DEBT_VERB.borrow : DEBT_VERB.repay, axisVerb: true }
            : {}),
    });

  return (
    <ChainTruthRow
      spec={{
        label: isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
        status: isOpen ? "open" : undefined,
        critical: ctx.eventType === "liquidation",
        labelOnSpine: isRedemption,
        labelTone: "external",
        deltas,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
