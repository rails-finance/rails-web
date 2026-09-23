"use client";

// Plain-English explainer for a Dolomite event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in
// lib/dolomite/explainer-clauses.tsx, plus the per-event "Learn More" modal on
// the mechanic. The card shows the paragraph's LEAD sentence as its teaser;
// this pane renders the REST (skipLead), so the first sentence is never
// duplicated. Every figure here is the leg's own moved amount, Prov-echoed
// against the header / spine delta receipt. Grounded in Solo-fork semantics:
// negative-balance debt (no Borrow action), transfers between the owner's own
// account numbers, trades that open leverage by crossing zero, and four-legged
// liquidations narrated by their debt leg.

import type { DolomiteContext } from "@/lib/shared/types/event-shape";
import type { DolomiteCoords } from "@/lib/dolomite/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  dolomiteDepositWithdrawContent,
  dolomiteTransferContent,
  dolomiteTradeContent,
  dolomiteLiquidationContent,
  dolomiteEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { dolomiteEventSlots, type DolomiteEvent } from "@/lib/dolomite/explainer-clauses";

export interface DolomiteEventExplainerProps {
  ctx: DolomiteContext;
  event: DolomiteEvent;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** Same-tx sibling legs (defaults to just this one) — the liquidation seam. */
  siblings?: DolomiteEvent[];
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Dolomite explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). */
export function dolomiteLearnMoreContent(ctx: DolomiteContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "deposit":
    case "withdraw":
      return dolomiteDepositWithdrawContent(ctx.eventType);
    case "transfer_in":
    case "transfer_out":
      return dolomiteTransferContent(ctx.eventType);
    case "trade_taker":
    case "trade_maker":
      return dolomiteTradeContent();
    case "liquidation":
    case "seize_out":
    case "seize_in":
    case "liquidation_payout":
    case "vaporize":
      return dolomiteLiquidationContent();
    default:
      return dolomiteEventFallbackContent();
  }
}

export function DolomiteEventExplainer({
  ctx,
  event,
  txHash,
  blockNumber,
  wallet,
  siblings,
  skipLead,
}: DolomiteEventExplainerProps) {
  const coords: DolomiteCoords = {
    txHash,
    blockNumber,
    owner: wallet,
    marketId: ctx.marketId,
  };
  const clauses = eventClauses(dolomiteEventSlots(ctx, coords, siblings ?? [event], event));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
