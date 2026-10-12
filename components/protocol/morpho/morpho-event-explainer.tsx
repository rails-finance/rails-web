"use client";

// The Explanation pane (zone Z2) of a Morpho event: the generator's sentences
// (lib/morpho/event-prose.ts, its strings in content/morpho/event-prose.yaml),
// one bullet each, under the three event headings when two of them hold two
// or more bullets. Each figure the header or the forensics block also prints
// echoes that receipt. The "?" modal depends on the event's kind only.

import type { MorphoContext } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import {
  assetsDeltaProv,
  liqClearedValueProv,
  liqSeizedValueProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { morphoEventProse, morphoExplanationRuns, type MorphoEchoKey } from "@/lib/morpho/event-prose";
import { morphoEventModal } from "@/lib/morpho/event-templates";
import { useChainId } from "@/lib/shared/chain-context";
import { useMorphoAtBlock } from "@/lib/morpho/use-market-at-block";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useMorphoNeighbours } from "@/lib/morpho/timeline-neighbours";
import { isPendlePt } from "@/lib/morpho/pendle-pt";
import { formatNumber } from "@/lib/utils/format";

export interface MorphoEventExplainerProps {
  ctx: MorphoContext;
  txHash?: string;
  blockNumber?: number;
  /** The event's id, to find its neighbours (lib/morpho/timeline-neighbours). */
  eventId?: string;
}

/** The event's "?" modal (it depends on the event's kind, and on whether the
 *  collateral is a Pendle principal token). */
export function morphoLearnMoreContent(ctx: MorphoContext): LearnMoreContent {
  return morphoEventModal(ctx.eventType, { pt: isPendlePt(ctx.collateralSymbol) });
}

/** The receipt each echoed figure registers against: the moved amount the
 *  event header prints, and the liquidation's two legs the forensics block
 *  prints (same vocabulary, coordinates and value, so the entry key matches). */
function echoFor(
  key: MorphoEchoKey,
  ctx: MorphoContext,
  coords: MorphoCoords,
  values: Record<string, string | number | null>,
): ProseEcho | null {
  const collSym = ctx.collateralSymbol;
  const loanSym = ctx.loanSymbol;
  switch (key) {
    case "amount": {
      const movedSym = ctx.side === "collateral" ? collSym : loanSym;
      return {
        info: assetsDeltaProv(movedSym, ctx.side, coords, ctx.eventType),
        value: chainTruthDeltaValue(Number(ctx.assetsDelta) || 0, false),
        symbol: movedSym,
      };
    }
    case "seized_value": {
      const seized = Number(values.seized);
      const value = Number(values.seized_value);
      const price = Number(values.price_used);
      if (!(seized > 0) || !(price > 0)) return null;
      return {
        info: liqSeizedValueProv(collSym, loanSym, coords, { amount: formatNumber(seized), price }),
        value: `${formatNumber(value)} ${loanSym}`,
        symbol: collSym,
      };
    }
    case "cleared_value": {
      const cleared = Number(values.cleared_value);
      if (!(cleared > 0)) return null;
      return {
        info: liqClearedValueProv(loanSym, coords, { amount: formatNumber(cleared) }),
        value: `${formatNumber(cleared)} ${loanSym}`,
        symbol: loanSym,
      };
    }
  }
}

export function MorphoEventExplainer({ ctx, txHash, blockNumber, eventId }: MorphoEventExplainerProps) {
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
  const prose = morphoEventProse({
    ctx,
    read,
    prevEventRead,
    earlierInTx: neighbours?.earlierInTx,
    blockNumber,
  });
  const echo = (key: MorphoEchoKey) => echoFor(key, ctx, coords, prose.values);
  const items = morphoExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  return <ProseExplainer items={items} />;
}
