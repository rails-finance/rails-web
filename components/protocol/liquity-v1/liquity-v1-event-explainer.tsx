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
  liquityV1OpenContent,
  liquityV1AdjustContent,
  liquityV1CloseContent,
  liquityV1RedemptionContent,
  liquityV1LiquidationContent,
  liquityV1EventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useCollFigures } from "@/components/shared/event-ledger-context";
import { liquityV1EventSlots } from "@/lib/liquity-v1/explainer-clauses";
import { useLiquityV1EventReadState, useLiquityV1Surplus } from "@/lib/liquity-v1/use-event-read";
import type { LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { adjustKinds, redemptionSplit } from "@/lib/liquity-v1/event-figures";
import { liquityV1EventPrice } from "./liquity-v1-event-detail";

export interface LiquityV1EventExplainerProps {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
  /** The Trove's owner — the receipt read filters on it. */
  wallet?: string;
  /** The PriceFeed price now, for a redemption's net outcome at today's price. */
  currentPrice?: number | null;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** On a liquidation, what the Trove's life left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal. Used by the card composer, which renders the "?" trigger
 *  on the footer row (this pane renders prose only). An adjustment takes the
 *  modal of the act with the most limits on it: a draw, then a withdrawal,
 *  then a repayment, then an added deposit. */
export function liquityV1LearnMoreContent(ctx: LiquityV1Context): LearnMoreContent {
  switch (ctx.eventType) {
    case "openTrove":
      return liquityV1OpenContent();
    case "closeTrove":
      return liquityV1CloseContent();
    case "adjustTrove": {
      const kinds = adjustKinds(ctx);
      const kind = (["borrow", "withdraw", "repay", "add"] as const).find((k) => kinds.includes(k));
      return kind ? liquityV1AdjustContent(kind) : liquityV1EventFallbackContent();
    }
    case "redemption":
      return liquityV1RedemptionContent();
    case "liquidation":
      return liquityV1LiquidationContent();
    default:
      return liquityV1EventFallbackContent();
  }
}

export function LiquityV1EventExplainer({
  ctx,
  txHash,
  blockNumber,
  wallet,
  currentPrice,
  skipLead,
  ownerOutcome,
}: LiquityV1EventExplainerProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber };
  // The same reads the opened grid makes; the hooks share one request each.
  const { read, pending: readPending } = useLiquityV1EventReadState(txHash, wallet);
  const wantsSurplus = ctx.eventType === "liquidation" || redemptionSplit(ctx)?.full === true;
  const surplus = useLiquityV1Surplus(wantsSurplus ? txHash : null, wantsSurplus ? wallet : null);
  const price = liquityV1EventPrice(ctx, read);
  const figures = useCollFigures();
  const clauses = figures(() =>
    eventClauses(liquityV1EventSlots(ctx, coords, { read, surplus, price, currentPrice, readPending, ownerOutcome })),
  );
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
