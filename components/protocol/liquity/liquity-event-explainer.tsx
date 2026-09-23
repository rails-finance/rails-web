"use client";

// Plain-English explainer for a Liquity V2 trove event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/liquity/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. The destructive liquidation's many
// payout legs render as a short bullet list under the prose (the charter §4
// escape hatch). Every figure is the card's own face value: a <Prov echo> of the
// header/detail receipt where an exported builder gives it one, plain bold
// otherwise (the highlight rule without invented provenance).

import type { ReactNode } from "react";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { BaseActivityEvent, GasCost } from "@/lib/shared/types/activity";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { getBatchManagerByAddress } from "@/lib/liquity/batch-managers";
import {
  liquityRedemptionContent,
  liquityLiquidationContent,
  liquityOpenTroveContent,
  liquityCloseTroveContent,
  liquityAdjustTroveContent,
  liquityInterestRateContent,
  liquityDelegationContent,
  liquityTransferContent,
  liquityEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import {
  liquityEventSlots,
  liquityLiquidationLegs,
  liquityGasClause,
  liquityExplainerTeaser,
} from "@/lib/liquity/explainer-clauses";

// ── LearnMore selection (byte-unchanged from the bullet-era explainer) ──────
// Exported for the card composer, which renders the "?" trigger on the footer
// row (this pane renders prose only).

export function liquityLearnMoreContent(ctx: LiquityContext): LearnMoreContent {
  switch (ctx.operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      return liquityOpenTroveContent();
    case "liquidate":
      return liquityLiquidationContent(ctx.collateralType);
    case "redeemCollateral":
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return liquityRedemptionContent(
        ctx.collateralType,
        ctx.stateAfter.annualInterestRate > 0 ? ctx.stateAfter.annualInterestRate : undefined,
      );
    case "closeTrove":
      return liquityCloseTroveContent();
    case "adjustTrove":
      return liquityAdjustTroveContent();
    case "adjustTroveInterestRate":
    case "applyPendingDebt":
      return liquityInterestRateContent(
        ctx.isInBatch
          ? {
              delegated: true,
              delegateName: ctx.batchManager ? getBatchManagerByAddress(ctx.batchManager)?.name : undefined,
            }
          : undefined,
      );
    case "setInterestBatchManager":
    case "removeFromBatch":
    case "setBatchManagerAnnualInterestRate":
      return liquityDelegationContent();
    case "transferTrove":
      return liquityTransferContent();
    default:
      // Never-empty floor: any unmapped operation still gets a generic modal.
      return liquityEventFallbackContent();
  }
}

// ── The teaser (progressive-disclosure lead sentence) ───────────────────────

/** The card's teaser — the lead sentence of the composed prose arc. Takes coords
 *  so the lead's figures echo the header/detail receipts exactly. */
export function getLiquityExplainerTeaser(
  ctx: LiquityContext,
  coords: { txHash?: string; blockNumber?: number },
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
  currentPrice?: number,
): ReactNode | null {
  return liquityExplainerTeaser(ctx, coords, previousEvent, currentEvent, currentPrice);
}

// ── The pane ────────────────────────────────────────────────────────────────

export interface LiquityEventExplainerProps {
  ctx: LiquityContext;
  previousEvent?: BaseActivityEvent;
  currentEvent?: BaseActivityEvent;
  /** Live oracle price — adds the "today" leg to the redemption P/L clause. */
  currentPrice?: number;
  /** This transaction's gas cost — rendered as the trailing clause. Passed only
   *  for owner-paid events (passive redemption/liquidation gas is the third
   *  party's, so the card omits it). */
  gas?: GasCost;
  /** Tx + block of the emitting event — threaded so the prose figures echo the
   *  header/detail change receipts (same coordinates → same receipt key). */
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

export function LiquityEventExplainer({
  ctx,
  previousEvent,
  currentEvent,
  currentPrice,
  gas,
  txHash,
  blockNumber,
  skipLead,
}: LiquityEventExplainerProps) {
  const coords = { txHash, blockNumber };
  const clauses = eventClauses(liquityEventSlots(ctx, coords, previousEvent, currentEvent, currentPrice));
  // Gas rides last, after the arc — never the lead, so skipLead removes exactly
  // the teaser sentence and the gas clause always survives into the pane.
  const gasClause = gas ? liquityGasClause(ctx, gas) : null;
  const withGas = gasClause ? [...clauses, gasClause] : clauses;
  const items = composeBullets(skipLead ? splitLead(withGas).rest : withGas);
  const list = liquityLiquidationLegs(ctx);

  return <ProseExplainer items={items} list={list} />;
}
