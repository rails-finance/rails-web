"use client";

// Plain-English explainer for a SparkLend event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/spark/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The near-clone of the
// Aave V3 explainer (SparkLend is a V3 fork with the same single-Pool account
// model), re-grounded in SparkLend's own semantics. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-echoed against the header / detail (and, on a liquidation, the
// forensics block).

import type { SparkContext } from "@/lib/shared/types/event-shape";
import type { SparkCoords } from "@/lib/spark/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  sparkSupplyWithdrawContent,
  sparkBorrowRepayContent,
  sparkLiquidationContent,
  sparkTransferContent,
  sparkEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { sparkEventSlots } from "@/lib/spark/explainer-clauses";

export interface SparkEventExplainerProps {
  ctx: SparkContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic SparkLend
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function sparkLearnMoreContent(ctx: SparkContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "supply":
    case "withdraw":
      return sparkSupplyWithdrawContent(ctx.eventType);
    case "borrow":
    case "repay":
      return sparkBorrowRepayContent(ctx.eventType);
    case "liquidation":
      return sparkLiquidationContent();
    case "transfer_in":
    case "transfer_out":
      return sparkTransferContent();
    default:
      return sparkEventFallbackContent();
  }
}

export function SparkEventExplainer({ ctx, txHash, blockNumber, skipLead }: SparkEventExplainerProps) {
  const coords: SparkCoords = { txHash, blockNumber };
  const clauses = eventClauses(sparkEventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
