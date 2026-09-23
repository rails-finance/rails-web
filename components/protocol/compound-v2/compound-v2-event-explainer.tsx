"use client";

// Plain-English explainer for a Compound V2 event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in
// lib/compound-v2/explainer-clauses.tsx, plus the per-event "Learn More" modal
// on the mechanic. The card shows the paragraph's LEAD sentence as its teaser;
// this pane renders the REST (skipLead), so the first sentence is never
// duplicated. Every figure here is the card's own face value, Prov-echoed
// against the spine flank / detail-grid receipt. The seize legs cross-reference
// the same-transaction liquidation in words (its card may render on another
// page), so no sibling figure crosses this card's scope.

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import type { CompoundV2Coords } from "@/lib/compound-v2/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  compoundV2SupplyWithdrawContent,
  compoundV2BorrowRepayContent,
  compoundV2TransferContent,
  compoundV2LiquidationContent,
  compoundV2SeizeContent,
  compoundV2EventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { compoundV2EventSlots, type CompoundV2Event } from "@/lib/compound-v2/explainer-clauses";

export interface CompoundV2EventExplainerProps {
  ctx: CompoundV2Context;
  event: CompoundV2Event;
  externalBy?: string;
  /** Same-tx sibling events (defaults to just this one) — the seize seam. */
  siblings?: CompoundV2Event[];
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Compound V2
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function compoundV2LearnMoreContent(ctx: CompoundV2Context): LearnMoreContent {
  switch (ctx.eventType) {
    case "mint":
    case "redeem":
      return compoundV2SupplyWithdrawContent(ctx.eventType);
    case "borrow":
    case "repay":
      return compoundV2BorrowRepayContent(ctx.eventType);
    case "transfer_in":
    case "transfer_out":
      return compoundV2TransferContent(ctx.eventType);
    case "liquidation":
      return compoundV2LiquidationContent();
    case "seize_out":
    case "seize_in":
    case "seize_burn":
      return compoundV2SeizeContent(ctx.eventType);
    default:
      return compoundV2EventFallbackContent();
  }
}

export function CompoundV2EventExplainer({
  ctx,
  event,
  externalBy,
  siblings,
  skipLead,
}: CompoundV2EventExplainerProps) {
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const coords: CompoundV2Coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    ctoken: market?.ctoken,
    marketLabel: market?.cSymbol ?? `c${ctx.marketSymbol}`,
    account: event.wallet,
  };
  const clauses = eventClauses(compoundV2EventSlots(ctx, coords, siblings ?? [event], event, externalBy));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
