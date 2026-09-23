"use client";

// Plain-English explainer for a Maple event — a layman PARAGRAPH (not bullets),
// composed from state-keyed clauses in lib/maple/explainer-clauses.tsx, plus the
// per-event "Learn More" modal on the mechanic. The card shows the paragraph's
// LEAD sentence as its teaser; this pane renders the REST (skipLead), so the
// first sentence is never duplicated. Every figure here is the card's own face
// value, Prov-traced as an echo of the header delta / detail receipt. The
// ERC-4626 share, the exit rate, the FIFO queue and the CCIP bridge escrow all
// speak in plain words here; the machinery lives in the receipts and the modal.

import type { MapleContext } from "@/lib/shared/types/event-shape";
import type { MapleCoords } from "@/lib/maple/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  mapleDepositWithdrawContent,
  mapleQueueContent,
  mapleTransferContent,
  mapleEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { mapleEventSlots } from "@/lib/maple/explainer-clauses";

export interface MapleEventExplainerProps {
  ctx: MapleContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Maple explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). */
export function mapleLearnMoreContent(ctx: MapleContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "deposit":
    case "withdraw":
      return mapleDepositWithdrawContent(ctx.eventType);
    case "request":
    case "request_decrease":
    case "request_cancel":
    case "request_fill":
      return mapleQueueContent(ctx.eventType);
    case "transfer_in":
    case "transfer_out":
      return mapleTransferContent(ctx.eventType);
    default:
      return mapleEventFallbackContent();
  }
}

export function MapleEventExplainer({ ctx, txHash, blockNumber, wallet, skipLead }: MapleEventExplainerProps) {
  const coords: MapleCoords = { txHash, blockNumber, pool: ctx.pool, account: wallet };
  const clauses = eventClauses(mapleEventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
