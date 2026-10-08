"use client";

// Plain-English explainer for a Morpho event — a layman PARAGRAPH (not bullets),
// composed from state-keyed clauses in lib/morpho/explainer-clauses.tsx, plus the
// per-event "Learn More" modal on the mechanic. The card shows the paragraph's
// LEAD sentence as its teaser; this pane renders the REST (skipLead), so the
// first sentence is never duplicated. Every figure here is the card's own face
// value, Prov-traced (an echo of the header delta, the detail grid's after-
// balances, or the liquidation forensics legs).

import type { MorphoContext } from "@/lib/shared/types/event-shape";
import type { MorphoCoords } from "@/lib/morpho/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  morphoMarketContent,
  morphoLiquidationContent,
  morphoEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { morphoEventSlots } from "@/lib/morpho/explainer-clauses";
import { useChainId } from "@/lib/shared/chain-context";
import { useMorphoAtBlock } from "@/lib/morpho/use-market-at-block";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useMorphoNeighbours } from "@/lib/morpho/timeline-neighbours";
import { parsePendlePt, pendlePtSentence, PENDLE_PT_DOC } from "@/lib/morpho/pendle-pt";

export interface MorphoEventExplainerProps {
  ctx: MorphoContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** The event's id, to find its neighbours (lib/morpho/timeline-neighbours). */
  eventId?: string;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Morpho Blue
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function morphoLearnMoreContent(ctx: MorphoContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "borrow":
    case "repay":
    case "withdraw_collateral":
      return morphoMarketContent(ctx.eventType);
    case "supply_collateral": {
      // A Pendle PT as collateral: what the token is, beside how adding works.
      const content = morphoMarketContent(ctx.eventType);
      const pt = parsePendlePt(ctx.collateralSymbol);
      if (!pt || !ctx.collateralSymbol) return content;
      return {
        ...content,
        details: [
          ...(content.details ?? []),
          { bold: "This collateral", text: pendlePtSentence(pt, ctx.collateralSymbol), sources: [PENDLE_PT_DOC] },
        ],
        links: [...(content.links ?? []), PENDLE_PT_DOC],
      };
    }
    case "liquidation":
      return morphoLiquidationContent();
    default:
      return morphoEventFallbackContent();
  }
}

export function MorphoEventExplainer({ ctx, txHash, blockNumber, skipLead, eventId }: MorphoEventExplainerProps) {
  const chainId = useChainId();
  const coords: MorphoCoords = {
    txHash,
    blockNumber,
    marketId: ctx.marketId,
    chainId,
    source: useCaptureSource(),
  };
  // The same request the opened card's grid makes (shared cache).
  const read = useMorphoAtBlock(ctx.marketId, blockNumber, chainId);
  // The events around this one, where the page provides them: the previous
  // event's market read (the same request that event's card makes) for the rate
  // between the two, and the kinds earlier in this transaction.
  const neighbours = useMorphoNeighbours(eventId);
  const rateEvent = ctx.eventType === "borrow" || ctx.eventType === "repay";
  const prevEventRead = useMorphoAtBlock(ctx.marketId, rateEvent ? neighbours?.prevBlock : undefined, chainId);
  const clauses = eventClauses(
    morphoEventSlots(ctx, coords, read, {
      prevEventRead,
      earlierInTx: neighbours?.earlierInTx,
      prevEvent: neighbours?.prev,
    }),
  );
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
