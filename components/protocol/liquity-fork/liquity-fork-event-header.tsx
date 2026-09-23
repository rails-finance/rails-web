"use client";

// Shared Liquity-V2-fork event header (chain-state tier) — one adapter onto the
// shared ChainTruthRow grammar for BOTH forks (Ebisu, Asymmetry). A Trove event
// moves two axes at once (branch collateral + the fork's stablecoin debt), so
// the row carries two signed deltas; each is after − before over two emitted
// absolutes (chain-derived), traced via <Prov>. The two forks differ only in
// what names the deployment — the debt symbol and the provenance builders — so
// those arrive as `builders`, the same shape the fork explainer already uses.
//
// Where the rate IS the event's point (open / rate change / batch join-or-leave)
// the header also carries a rate pill: the rate the owner (or a delegate acting
// for them) chose, echoing the detail grid's rate receipt. A rate on every
// adjust would turn the header into a ticker, so it is scoped to those events.
//
// A batched Trove's rate pill is paired with a party-pink DELEGATE chip naming
// the interest-batch manager — scoped to the SAME events, because the chip's
// claim is "this delegate determines the rate on this row", which is only the
// point where the rate is. On a plain adjustTrove the owner moved collateral and
// the manager is a standing fact about the Trove, not about the event; on a
// redemption a third party acted and the manager did nothing at all. Against the
// real timelines that scope is what keeps the header a header: of the 3,628 rows
// carrying a manager across both forks, 3,387 are redemptions and 159 are owner
// adjusts — chipping them all would bury the 82 rows where a delegate was
// actually handed control.

import type { AssetFlow, EbisuContext, AsymmetryContext, OriginEnvelope } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import type { Provenance } from "@/components/shared/provenance";
import type { LiquityForkCoords, DeltaOps } from "@/lib/shared/liquity-fork-provenance";
import { FORK_RATE_PILL_EVENTS, COLL_VERB, DEBT_VERB } from "@/lib/shared/liquity-fork-ops";
import { getForkBatchManagerName } from "@/lib/shared/fork-batch-managers";

/** The two fork contexts are structural twins; either drives the header. */
export type LiquityForkEventContext = EbisuContext | AsymmetryContext;

/** The per-deployment blanks: the debt symbol and the provenance builders (the
 *  fork vocabulary's own collDeltaProv / debtDeltaProv / rateAtEventProv). */
export interface LiquityForkHeaderBuilders {
  debtSymbol: string;
  collDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  debtDeltaProv: (coords: LiquityForkCoords, ops?: DeltaOps, origin?: OriginEnvelope | null) => Provenance;
  rateAtEventProv: (coords?: LiquityForkCoords) => Provenance;
  batchManagerProv: (coords: LiquityForkCoords | undefined, address: string) => Provenance;
}

export interface LiquityForkEventHeaderProps {
  actionLabel: string;
  /** Zero-delta adjust — the sub-epsilon dust chip would contradict the
   *  "No change" label, so the row renders label-only. */
  noChange?: boolean;
  ctx: LiquityForkEventContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  builders: LiquityForkHeaderBuilders;
  /** The event's own movements, read for the two contracts this row names. A
   *  fork adds branches over time and each branch is a different collateral, so
   *  the set of symbols reaching this header is open-ended and the house table
   *  is the wrong authority on it; the Trove's flows record the ERC-20s that
   *  actually moved, which is what the icon chip has to have. */
  flows?: AssetFlow[];
}

export function LiquityForkEventHeader({
  actionLabel,
  noChange,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  builders,
  flows,
}: LiquityForkEventHeaderProps) {
  const coords: LiquityForkCoords = {
    txHash,
    blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  const deltas: ChainTruthDelta[] = [];

  // A redemption borrows the V2 grammar: collateral "Cleared", debt "Reduced",
  // both in the caution tone, magnitudes only — the action name rides the spine.
  const isRedemption = ctx.eventType === "redeemCollateral";

  // Opens + owner adjusts get V2's per-axis grammar: each axis carries its own
  // imperative verb (from the SAME sign classification as the CSV label), so the
  // open shows a green pill + labeled axes and a combined adjust drops the merged
  // "Add + Borrow" verb. Verbs are the fork vocabulary's own (Add/Withdraw,
  // Borrow/Repay) — not standardized to Supply/Borrow.
  const isOpen = ctx.eventType === "openTrove" || ctx.eventType === "openTroveAndJoinBatch";
  const isAdjust = ctx.eventType === "adjustTrove";
  const perAxis = isOpen || isAdjust;

  const coll = Number(ctx.collDelta) || 0;
  if (coll !== 0 && !noChange)
    deltas.push({
      value: coll,
      symbol: ctx.collateralSymbol,
      address: soleFlowAddress(flows, ctx.collateralSymbol),
      // Operand values ride into the receipt: the emitted after, and the
      // previous event's value it was diffed against (after − delta).
      prov: builders.collDeltaProv(
        coords,
        {
          after: ctx.collAfter,
          before: ctx.collAfter != null ? Number(ctx.collAfter) - coll : null,
        },
        ctx.origin?.coll,
      ),
      ...(isRedemption
        ? { label: "Cleared", tone: "caution" as const }
        : perAxis
          ? { label: coll > 0 ? COLL_VERB.add : COLL_VERB.withdraw, axisVerb: true }
          : {}),
    });

  const debt = Number(ctx.debtDelta) || 0;
  if (debt !== 0 && !noChange)
    deltas.push({
      value: debt,
      symbol: builders.debtSymbol,
      address: soleFlowAddress(flows, builders.debtSymbol),
      prov: builders.debtDeltaProv(
        coords,
        {
          after: ctx.debtAfter,
          before: ctx.debtAfter != null ? Number(ctx.debtAfter) - debt : null,
        },
        ctx.origin?.debt,
      ),
      ...(isRedemption
        ? { label: "Reduced", tone: "caution" as const }
        : perAxis
          ? { label: debt > 0 ? DEBT_VERB.borrow : DEBT_VERB.repay, axisVerb: true }
          : {}),
    });

  // Rate pill — only where the rate IS the event's point (open, rate change,
  // batch join/leave). A batched trove's rate is the delegate's, so it takes the
  // pink `delegate` treatment; the pill echoes the detail grid's rate receipt.
  const rate = ctx.interestRate != null ? Number(ctx.interestRate) : null;
  const ratePill =
    rate != null && Number.isFinite(rate) && FORK_RATE_PILL_EVENTS.has(ctx.eventType)
      ? { pct: rate, tone: ctx.isBatched ? ("delegate" as const) : undefined, prov: builders.rateAtEventProv(coords) }
      : undefined;

  // Delegate chip — the batch manager behind that rate, on the same rows. The
  // address arrives lowercase from the MV. `getForkBatchManagerName` resolves
  // the managers with a verifiable public identity (see lib/shared/fork-batch-managers.ts
  // for the evidence bar); the rest return undefined and the chip keeps its
  // truncated address, which the shared party seam already degrades to. In
  // practice the surviving rows are the two batch-JOIN events — a batched
  // Trove's rate changes on its BATCH, so adjustTroveInterestRate and
  // removeFromBatch are never batched and carry no manager.
  const party =
    ctx.batchManager != null && FORK_RATE_PILL_EVENTS.has(ctx.eventType)
      ? {
          prefix: "delegate",
          address: ctx.batchManager,
          name: getForkBatchManagerName(ctx.batchManager),
          tone: "party" as const,
          prov: builders.batchManagerProv(coords, ctx.batchManager),
        }
      : undefined;

  return (
    <ChainTruthRow
      spec={{
        // Open → the short pill word + green status; a combined/single owner
        // adjust drops the row verb (the per-axis delta labels carry it) but
        // keeps its label when nothing moved (a "No change" row has no deltas).
        label: isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
        status: isOpen ? "open" : undefined,
        critical: ctx.eventType === "liquidate",
        labelOnSpine: isRedemption,
        deltas,
        ratePill,
        party,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
