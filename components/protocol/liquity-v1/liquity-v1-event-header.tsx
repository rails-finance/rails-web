"use client";

// Liquity V1 event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. A Trove event moves BOTH axes at once (ETH collateral + LUSD debt), so the
// row can carry two signed deltas. Each delta is after − before over two emitted
// absolutes (chain-derived); traced via <Prov>. No USD, no collateral ratio — layers.

import type { AssetFlow, LiquityV1Context } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import { collDeltaProv, debtDeltaProv, type LiquityV1Coords } from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { COLL_VERB, DEBT_VERB } from "@/lib/shared/liquity-fork-ops";

export interface LiquityV1EventHeaderProps {
  actionLabel: string;
  ctx: LiquityV1Context;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** The event's own movements, read for the LUSD contract behind the debt
   *  delta. The COLLATERAL delta deliberately takes nothing from here: V1's
   *  collateral is native ETH, which the timeline records as the 0xEeee…eeee
   *  sentinel — an address-shaped value that is not a contract, and handing it
   *  to the chip would send it to two CDNs that cannot answer for it. ETH
   *  already draws the curated local mark from its symbol. */
  flows?: AssetFlow[];
}

export function LiquityV1EventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  flows,
}: LiquityV1EventHeaderProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber };
  const deltas: ChainTruthDelta[] = [];

  // A redemption borrows the V2 grammar: collateral "Cleared", debt "Reduced",
  // both in the caution tone, magnitudes only (the labels carry direction) —
  // and the action name rides the spine's REDEMPTION pill, not the row label.
  const isRedemption = ctx.eventType === "redemption";

  // Opens + owner adjusts get V2's per-axis grammar: each axis its own imperative
  // verb (Add/Withdraw ETH, Borrow/Repay LUSD) — the SAME classification the CSV
  // label uses (forkAdjustLabel), so the split can't disagree with the export. No
  // rate pill: V1 has no user-set rate, and that absence is the fact about V1.
  const isOpen = ctx.eventType === "openTrove";
  const isAdjust = ctx.eventType === "adjustTrove";
  const perAxis = isOpen || isAdjust;

  const coll = Number(ctx.collDelta) || 0;
  if (coll !== 0)
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
        ? { label: "Cleared", tone: "caution" as const }
        : perAxis
          ? { label: coll > 0 ? COLL_VERB.add : COLL_VERB.withdraw, axisVerb: true }
          : {}),
    });

  const debt = Number(ctx.debtDelta) || 0;
  if (debt !== 0)
    deltas.push({
      value: debt,
      symbol: DEBT_SYMBOL,
      address: soleFlowAddress(flows, DEBT_SYMBOL),
      prov: debtDeltaProv(coords, {
        after: ctx.debtAfter,
        before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debt : null,
      }),
      ...(isRedemption
        ? { label: "Reduced", tone: "caution" as const }
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
        deltas,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
