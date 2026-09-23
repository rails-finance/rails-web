"use client";

// Plain-English explainer for a Morpho event — a layman PARAGRAPH (not bullets),
// composed from state-keyed clauses in lib/morpho/explainer-clauses.tsx, plus the
// per-event "Learn More" modal on the mechanic. The card shows the paragraph's
// LEAD sentence as its teaser; this pane renders the REST (skipLead), so the
// first sentence is never duplicated. Every figure here is the card's own face
// value, Prov-traced (an echo of the header delta, the detail grid's after-
// balances, or the liquidation forensics legs).

import type { MorphoContext } from "@/lib/shared/types/event-shape";
import type { MorphoCoords } from "@/lib/morpho/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  morphoMarketContent,
  morphoLiquidationContent,
  morphoEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { morphoEventSlots } from "@/lib/morpho/explainer-clauses";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface MorphoEventExplainerProps {
  ctx: MorphoContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Morpho Blue
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function morphoLearnMoreContent(ctx: MorphoContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "borrow":
    case "repay":
    case "supply_collateral":
    case "withdraw_collateral":
      return morphoMarketContent(ctx.eventType);
    case "liquidation":
      return morphoLiquidationContent();
    default:
      return morphoEventFallbackContent();
  }
}

export function MorphoEventExplainer({ ctx, txHash, blockNumber, skipLead }: MorphoEventExplainerProps) {
  const coords: MorphoCoords = {
    txHash,
    blockNumber,
    marketId: ctx.marketId,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  const clauses = eventClauses(morphoEventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
