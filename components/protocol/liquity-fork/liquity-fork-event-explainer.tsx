"use client";

// Plain-English explainer for an Ebisu / Asymmetry Trove event — a layman
// PARAGRAPH (not bullets), composed from state-keyed clauses in
// lib/shared/liquity-fork-explainer-clauses.tsx, plus the per-event "Learn More"
// modal on the mechanic. Shared by both forks: the contract family is the same
// V2 architecture, so only the protocol name + stablecoin (`fork`) and the
// fork's own provenance builders (`builders`) differ. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST
// (skipLead), so the first sentence is never duplicated. Every figure is the
// card's own face value, Prov-echoed onto the header / detail / forensics
// receipt of the same figure.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  liquityForkBorrowingContent,
  liquityForkRateContent,
  liquityForkRedemptionContent,
  liquityForkLiquidationContent,
  liquityForkBatchContent,
  liquityForkEventFallbackContent,
  type LiquityForkLearnMoreParams,
} from "@/lib/shared/learn-more-content";
import type { LiquityForkCoords } from "@/lib/shared/liquity-fork-provenance";
import { clause, composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import type { GasCost } from "@/lib/shared/types/event-shape";
import { useCollFigures } from "@/components/shared/event-ledger-context";
import { formatGasCost } from "@/lib/shared/format-event";
import {
  liquityForkEventSlots,
  type LiquityForkEventContext,
  type LiquityForkExplainerProvs,
} from "@/lib/shared/liquity-fork-explainer-clauses";

export type { LiquityForkEventContext } from "@/lib/shared/liquity-fork-explainer-clauses";

export interface LiquityForkEventExplainerProps {
  ctx: LiquityForkEventContext;
  /** Protocol name + stablecoin + the one live-verified docs link. */
  fork: LiquityForkLearnMoreParams;
  /** The fork's own provenance builders — the figures echo these. */
  builders: LiquityForkExplainerProvs;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** This transaction's gas — the pane's last clause, as on Liquity V2. Passed
   *  for the owner's events on a mainnet fork only: a redeemer, a liquidator
   *  or a batch manager paid for theirs, and on Base the execution fee leaves
   *  out the L1 data fee. */
  gas?: GasCost;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, keyed by the fork's own name + stablecoin. Used by the card
 *  composer, which renders the "?" trigger on the footer row (this pane renders
 *  prose only). */
export function liquityForkLearnMoreContent(
  ctx: LiquityForkEventContext,
  fork: LiquityForkLearnMoreParams,
): LearnMoreContent {
  switch (ctx.eventType) {
    case "openTrove":
    case "adjustTrove":
    case "closeTrove":
    case "applyPendingDebt":
      return liquityForkBorrowingContent(
        fork,
        ctx.eventType === "openTrove" ? "openTrove" : ctx.eventType === "closeTrove" ? "closeTrove" : "adjustTrove",
      );
    case "adjustTroveInterestRate":
      return liquityForkRateContent(fork);
    case "redeemCollateral":
      return liquityForkRedemptionContent(fork);
    case "liquidate":
      return liquityForkLiquidationContent(fork);
    case "openTroveAndJoinBatch":
    case "setInterestBatchManager":
    case "removeFromBatch":
    case "setBatchManagerAnnualInterestRate":
    case "lowerBatchManagerAnnualFee":
      return liquityForkBatchContent(fork);
    default:
      return liquityForkEventFallbackContent(fork);
  }
}

export function LiquityForkEventExplainer({
  ctx,
  fork,
  builders,
  txHash,
  blockNumber,
  skipLead,
  gas,
}: LiquityForkEventExplainerProps) {
  const coords: LiquityForkCoords = {
    txHash,
    blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  const figures = useCollFigures();
  const clauses = figures(() => eventClauses(liquityForkEventSlots(ctx, coords, fork, builders)));
  // Gas rides last, after the arc — never the lead, so skipLead removes the
  // teaser sentence alone and the gas clause always survives into the pane.
  const withGas =
    gas && gas.gasCostEth > 0 ? [...clauses, clause(<>Gas for this transaction: {formatGasCost(gas)}.</>)] : clauses;
  const items = composeBullets(skipLead ? splitLead(withGas).rest : withGas);

  return <ProseExplainer items={items} />;
}
