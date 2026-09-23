"use client";

// Plain-English explainer for a PWN event — a layman PARAGRAPH (not bullets),
// composed from status-keyed clauses in lib/pwn/explainer-clauses.tsx, plus the
// per-event "Learn More" modal on the mechanic. A PWN event carries no running
// balances, so the clauses key on the loan's LIFECYCLE STATUS (active / repaid /
// defaulted / settled / retired), not on before→after figures. The card shows
// the paragraph's LEAD sentence as its teaser; this pane renders the REST
// (skipLead), so the first sentence is never duplicated. The economic events
// (created / paid_back / claimed) narrate; the custody events (minted / burned)
// carry one cross-reference back to their same-tx economic sibling.

import type { PwnContext } from "@/lib/shared/types/event-shape";
import type { PwnCoords } from "@/lib/pwn/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  pwnLoanCreatedContent,
  pwnNoteLifecycleContent,
  pwnRepaymentContent,
  pwnDefaultContent,
  pwnExtensionContent,
  pwnEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { pwnEventSlots, type PwnEvent } from "@/lib/pwn/explainer-clauses";

export interface PwnEventExplainerProps {
  ctx: PwnContext;
  event: PwnEvent;
  /** Same-tx sibling events (defaults to just this one) — the custody
   *  cross-reference seam. */
  siblings?: PwnEvent[];
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic PWN explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). */
export function pwnLearnMoreContent(ctx: PwnContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "created":
      return pwnLoanCreatedContent();
    case "minted":
    case "burned":
      return pwnNoteLifecycleContent(ctx.eventType);
    case "paid_back":
      return pwnRepaymentContent("paid_back");
    case "claimed":
      return ctx.defaulted ? pwnDefaultContent() : pwnRepaymentContent("claimed");
    case "extended":
      return pwnExtensionContent();
    default:
      return pwnEventFallbackContent();
  }
}

export function PwnEventExplainer({ ctx, event, siblings, skipLead }: PwnEventExplainerProps) {
  const coords: PwnCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    loanId: ctx.loanId,
    version: ctx.version,
  };
  const clauses = eventClauses(pwnEventSlots(ctx, coords, siblings ?? [event], event));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
