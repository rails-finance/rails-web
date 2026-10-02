"use client";

// Plain-English explainer for a LlamaLend event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/llamalend/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST
// (skipLead), so the first sentence is never duplicated. Every figure here is
// the card's own face value, Prov-traced — an echo of the header delta or the
// detail-grid after-image. Grounded in LLAMMA semantics: collateral as band
// liquidity, two-stage liquidation (soft = a state whose swaps reverse and whose losses
// stay, hard = a one-shot event), per-second debt accrual, and the seized already-converted crvUSD that
// is NEVER the debt cleared.

import type { LlamalendContext } from "@/lib/shared/types/event-shape";
import type { LlamalendCoords } from "@/lib/llamalend/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  llamalendBorrowContent,
  llamalendRepayContent,
  llamalendLiquidationContent,
  llamalendEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { llamalendEventSlots } from "@/lib/llamalend/explainer-clauses";
import { useLlamalendEventState } from "@/lib/llamalend/use-event-state";
import { llamalendEventFigures, type LlamalendLoanMark, type LlamalendNextRow } from "@/lib/llamalend/event-figures";

export interface LlamalendEventExplainerProps {
  ctx: LlamalendContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** Where the event sits among the page's loans. */
  loanMark?: LlamalendLoanMark | null;
  /** The market's liquidation discount now, from the page's live read. */
  marketDiscount?: number | null;
  /** The loan's next row (a partial liquidation states what became of the rest). */
  next?: LlamalendNextRow | null;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal. Used by the card composer, which renders the "?" trigger
 *  on the footer row (this pane renders prose only). */
export function llamalendLearnMoreContent(ctx: LlamalendContext, approvals: boolean | null = null): LearnMoreContent {
  switch (ctx.eventType) {
    case "borrow":
    case "add_collateral":
      return llamalendBorrowContent(ctx.eventType);
    case "repay":
    case "remove_collateral":
      return llamalendRepayContent(ctx.eventType);
    case "liquidation":
      return llamalendLiquidationContent(!!ctx.selfLiquidation, approvals);
    default:
      return llamalendEventFallbackContent();
  }
}

export function LlamalendEventExplainer({
  ctx,
  txHash,
  blockNumber,
  wallet,
  skipLead,
  loanMark,
  marketDiscount,
  next,
}: LlamalendEventExplainerProps) {
  const coords: LlamalendCoords = { txHash, blockNumber, controller: ctx.controller, user: wallet };
  // The same before/after read the grid uses (one request, shared).
  const state = useLlamalendEventState(ctx, blockNumber, wallet);
  const f = state ? llamalendEventFigures(ctx, state) : null;
  // After a partial liquidation, the next row's read gives the health the
  // remainder had fallen to (the same request that row's card makes).
  const isLiq = ctx.eventType === "liquidation";
  const nextState = useLlamalendEventState(
    next?.ctx ?? ctx,
    isLiq && f?.hasLoan && next ? next.blockNumber : undefined,
    wallet,
  );
  const nextF = nextState && next ? llamalendEventFigures(next.ctx, nextState) : null;
  const liq = isLiq
    ? {
        marketDiscount: marketDiscount ?? null,
        next: next ? { ...next, healthBefore: nextF?.healthBefore ?? null } : null,
      }
    : null;
  const clauses = eventClauses(llamalendEventSlots(ctx, coords, f, loanMark, liq));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
