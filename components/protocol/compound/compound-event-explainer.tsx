"use client";

// Plain-English explainer for a Compound V3 event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/compound/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-traced (an echo of the header / detail receipt), or — on the
// AbsorbCollateral leg — a muted cross-reference to the same-transaction
// absorption whose figures live on another card.

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  compoundBaseContent,
  compoundCollateralContent,
  compoundLiquidationContent,
  compoundTransferContent,
  compoundEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { compoundEventSlots, coordsFor, type CompoundEvent } from "@/lib/compound/explainer-clauses";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface CompoundEventExplainerProps {
  ctx: CompoundContext;
  event: CompoundEvent;
  txHash?: string;
  blockNumber?: number;
  /** Same-tx sibling events (defaults to just this one) — the absorb-leg seam. */
  siblings?: CompoundEvent[];
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Compound V3
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function compoundLearnMoreContent(ctx: CompoundContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "supply":
    case "withdraw":
      return compoundBaseContent(ctx.eventType);
    case "supply_collateral":
    case "withdraw_collateral":
      return compoundCollateralContent(ctx.eventType);
    case "absorb_debt":
    case "absorb_collateral":
      return compoundLiquidationContent();
    case "transfer_in":
    case "transfer_out":
      return compoundTransferContent(false);
    case "transfer_collateral_in":
    case "transfer_collateral_out":
      return compoundTransferContent(true);
    default:
      return compoundEventFallbackContent();
  }
}

export function CompoundEventExplainer({
  ctx,
  event,
  txHash,
  blockNumber,
  siblings,
  skipLead,
}: CompoundEventExplainerProps) {
  const m = useCometMarket(ctx.market);
  const coords = { ...coordsFor(ctx, txHash, blockNumber, m), chainId: useChainId(), source: useCaptureSource() };
  const clauses = eventClauses(compoundEventSlots(ctx, coords, siblings ?? [event], event, m));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
