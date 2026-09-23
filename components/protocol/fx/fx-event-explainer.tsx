"use client";

// Plain-English explainer for an f(x) event — a layman PARAGRAPH (not bullets),
// composed from state-keyed clauses in lib/fx/explainer-clauses.tsx, plus the
// per-event "Learn More" modal on the mechanic. The card shows the paragraph's
// LEAD sentence as its teaser; this pane renders the REST (skipLead), so the
// first sentence is never duplicated. Every figure here is the card's own face
// value, Prov-echoed against the header / detail receipt.

import type { FxContext } from "@/lib/shared/types/event-shape";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import type { FxCoords } from "@/lib/fx/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  fxOperateContent,
  fxLiquidationContent,
  fxTransferContent,
  fxEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { fxEventSlots } from "@/lib/fx/explainer-clauses";

export interface FxEventExplainerProps {
  ctx: FxContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic f(x) explainer.
 *  Selection preserved byte-for-byte from the pre-prose explainer. Used by the
 *  card composer, which renders the "?" trigger on the footer row (this pane
 *  renders prose only). */
export function fxLearnMoreContent(ctx: FxContext): LearnMoreContent {
  const isOpen = ctx.isOpen === true;
  const isClose = ctx.emptiesPosition === true && ctx.eventType !== "liquidation";
  return ctx.eventType === "transfer"
    ? fxTransferContent()
    : ctx.eventType === "tickRebalance"
      ? fxLiquidationContent()
      : ctx.eventType === "liquidation"
        ? fxLiquidationContent()
        : isOpen
          ? fxOperateContent("open")
          : isClose
            ? fxOperateContent("close")
            : ctx.eventType === "operate"
              ? fxOperateContent("adjust")
              : fxEventFallbackContent();
}

export function FxEventExplainer({ ctx, txHash, blockNumber, skipLead }: FxEventExplainerProps) {
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const clauses = eventClauses(fxEventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
