"use client";

// Plain-English explainer for a Fluid event — a layman PARAGRAPH (not bullets),
// composed from state-keyed clauses in lib/fluid/explainer-clauses.tsx, plus the
// per-event "Learn More" modal on the mechanic. The card shows the paragraph's
// LEAD sentence as its teaser; this pane renders the REST (skipLead), so the
// first sentence is never duplicated. Every figure here is the card's own face
// value, Prov-traced (an echo of the spine / detail receipt, or — on the mint
// narrator card — a primary for a sibling event's figure that lives beyond this
// card's scope).

import type { FluidContext } from "@/lib/shared/types/event-shape";
import type { FluidCoords } from "@/lib/fluid/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  fluidOperateContent,
  fluidLiquidationContent,
  fluidTransferContent,
  fluidEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { pairLabel } from "@/lib/fluid/asset-catalog";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { fluidEventSlots, type FluidEvent } from "@/lib/fluid/explainer-clauses";

export interface FluidEventExplainerProps {
  ctx: FluidContext;
  event: FluidEvent;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** Same-tx sibling events (defaults to just this one) — the split-open seam. */
  siblings?: FluidEvent[];
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Fluid explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). */
export function fluidLearnMoreContent(ctx: FluidContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "deposit":
    case "withdraw":
      return fluidOperateContent("deposit");
    case "borrow":
    case "payback":
      return fluidOperateContent("borrow");
    case "deposit_borrow":
    case "withdraw_payback":
    case "deposit_payback":
    case "withdraw_borrow":
      return fluidOperateContent("composite");
    case "liquidated":
      return fluidLiquidationContent(false);
    case "absorbed":
      return fluidLiquidationContent(true);
    case "mint":
    case "transfer":
      return fluidTransferContent();
    default:
      return fluidEventFallbackContent();
  }
}

export function FluidEventExplainer({
  ctx,
  event,
  txHash,
  blockNumber,
  wallet,
  siblings,
  skipLead,
}: FluidEventExplainerProps) {
  const coords: FluidCoords = {
    txHash,
    blockNumber,
    vault: ctx.vault,
    pairLabel: pairLabel(ctx.supplySymbol, ctx.borrowSymbol),
    nftId: ctx.nftId,
    owner: ctx.ownerAt ?? wallet,
  };
  const clauses = eventClauses(fluidEventSlots(ctx, coords, siblings ?? [event], event));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
