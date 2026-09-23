"use client";

// Plain-English explainer for a Liquity V1 Trove event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/liquity-v1/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic (borrowing / redemptions /
// liquidations, all grounded in the V1 docs). The card shows the paragraph's LEAD
// sentence as its teaser; this pane renders the REST (skipLead), so the first
// sentence is never duplicated. Every figure here is the card's own face value,
// Prov-traced as an echo of the spine / detail / forensics receipt.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import type { LiquityV1Coords } from "@/lib/liquity-v1/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  liquityV1BorrowingContent,
  liquityV1RedemptionContent,
  liquityV1LiquidationContent,
  liquityV1EventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { liquityV1EventSlots } from "@/lib/liquity-v1/explainer-clauses";

export interface LiquityV1EventExplainerProps {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal. Used by the card composer, which renders the "?" trigger
 *  on the footer row (this pane renders prose only). */
export function liquityV1LearnMoreContent(ctx: LiquityV1Context): LearnMoreContent {
  switch (ctx.eventType) {
    case "openTrove":
    case "adjustTrove":
    case "closeTrove":
      return liquityV1BorrowingContent(ctx.eventType);
    case "redemption":
      return liquityV1RedemptionContent();
    case "liquidation":
      return liquityV1LiquidationContent();
    default:
      return liquityV1EventFallbackContent();
  }
}

export function LiquityV1EventExplainer({ ctx, txHash, blockNumber, skipLead }: LiquityV1EventExplainerProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber };
  const clauses = eventClauses(liquityV1EventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
