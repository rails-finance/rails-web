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
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
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
}: LiquityForkEventExplainerProps) {
  const coords: LiquityForkCoords = {
    txHash,
    blockNumber,
    collateralType: ctx.collateralSymbol,
    isBatched: ctx.isBatched,
  };
  const clauses = eventClauses(liquityForkEventSlots(ctx, coords, fork, builders));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
