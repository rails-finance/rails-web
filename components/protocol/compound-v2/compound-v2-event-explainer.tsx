"use client";

// The Explanation pane (zone Z2) of a Compound V2 event: the generator's
// sentences (lib/compound-v2/event-prose.ts, its strings in
// content/compound-v2/event-prose.yaml), one bullet each. The card shows the
// first as its teaser and this pane the rest; a grouped explanation has no
// teaser, every bullet sits under its group's heading. Each figure the spine
// flank or the detail grid also prints echoes that receipt.

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { formatNumber } from "@/lib/utils/format";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import {
  assetsDeltaProv,
  cTokensDeltaProv,
  liqDebtRepaidProv,
  seizeLegProv,
  seizeTokensProv,
  transferAmountProv,
  type CompoundV2Coords,
} from "@/lib/compound-v2/event-provenance";
import {
  compoundV2EventProse,
  compoundV2ExplanationRuns,
  type CompoundV2EchoKey,
  type CompoundV2Event,
  type CompoundV2EventProse,
} from "@/lib/compound-v2/event-prose";

export interface CompoundV2EventExplainerProps {
  ctx: CompoundV2Context;
  event: CompoundV2Event;
  externalBy?: string;
  /** Same-tx sibling events (defaults to just this one): the seize seam. */
  siblings?: CompoundV2Event[];
}

/** The coords every figure cites: the same subset the header and detail build,
 *  so an explainer echo collapses onto their primary receipt. */
export function compoundV2EchoCoords(ctx: CompoundV2Context, event: CompoundV2Event): CompoundV2Coords {
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    ctoken: market?.ctoken,
    marketLabel: market?.cSymbol ?? `c${ctx.marketSymbol}`,
    account: event.wallet,
  };
}

/** The receipt each echoed figure registers against: the spine flank and the
 *  detail grid's change receipts. */
export function compoundV2EchoFor(
  key: CompoundV2EchoKey,
  ctx: CompoundV2Context,
  coords: CompoundV2Coords,
): ProseEcho | null {
  const sym = ctx.marketSymbol;
  const cSym = COMPOUND_V2_MARKET_BY_KEY[ctx.market]?.cSymbol ?? `c${sym}`;
  const signed = (human?: string) => chainTruthDeltaValue(Number(human ?? 0), false);
  switch (key) {
    case "delta":
      return ctx.eventType === "mint" ||
        ctx.eventType === "redeem" ||
        ctx.eventType === "borrow" ||
        ctx.eventType === "repay"
        ? {
            info: assetsDeltaProv(sym, ctx.eventType, coords, ctx.raw?.amount),
            value: signed(ctx.assetsDelta),
            symbol: sym,
          }
        : null;
    case "ctokens": {
      // On mint and redeem the header emits only the underlying leg, so the
      // cToken delta's only receipt is the detail grid's change, which
      // registers with no symbol.
      const raw = ctx.raw?.cTokens;
      switch (ctx.eventType) {
        case "mint":
        case "redeem":
          return { info: cTokensDeltaProv(cSym, ctx.eventType, coords, raw), value: signed(ctx.cTokensDelta) };
        case "transfer_in":
        case "transfer_out":
          return {
            info: transferAmountProv(cSym, ctx.eventType === "transfer_in" ? "in" : "out", coords, raw),
            value: signed(ctx.cTokensDelta),
            symbol: cSym,
          };
        case "seize_out":
        case "seize_in":
        case "seize_burn":
          return {
            info: seizeLegProv(cSym, ctx.eventType, coords, raw),
            value: signed(ctx.cTokensDelta),
            symbol: cSym,
          };
        default:
          return null;
      }
    }
    case "repaid":
      return {
        info: liqDebtRepaidProv(sym, coords, ctx.raw?.amount),
        value: signed(ctx.assetsDelta),
        symbol: sym,
      };
    case "seized": {
      const collateral = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
      const collateralCSymbol = collateral?.cSymbol ?? (ctx.collateralSymbol ? `c${ctx.collateralSymbol}` : "");
      return ctx.seizeTokens != null && collateralCSymbol
        ? {
            info: seizeTokensProv(collateralCSymbol, coords, ctx.raw?.seizeTokens),
            value: formatNumber(Number(ctx.seizeTokens)),
            symbol: collateralCSymbol,
          }
        : null;
    }
  }
}

/** The explanation draws its groups' headings. */
export const isGroupedExplanation = (prose: CompoundV2EventProse) => prose.L4.some((s) => s.group);

/** The card's teaser: the first sentence. */
export function CompoundV2ExplainerTeaser({
  prose,
  echo,
}: {
  prose: CompoundV2EventProse;
  echo: (key: CompoundV2EchoKey) => ProseEcho | null;
}) {
  const lead = prose.L4[0];
  return lead ? <ProseSentenceText s={lead} echo={echo} /> : null;
}

export function CompoundV2EventExplainer({ ctx, event, externalBy, siblings }: CompoundV2EventExplainerProps) {
  const prose = compoundV2EventProse({
    ctx,
    siblings: siblings ?? [event],
    self: event,
    externalBy,
    blockNumber: event.blockNumber,
  });
  const coords = compoundV2EchoCoords(ctx, event);
  const echo = (key: CompoundV2EchoKey) => compoundV2EchoFor(key, ctx, coords);
  const sentence = (s: CompoundV2EventProse["L4"][number]) => (
    <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />
  );

  if (isGroupedExplanation(prose))
    return (
      <ProseExplainer
        items={compoundV2ExplanationRuns(prose).flatMap((run) =>
          run.sentences.map((s) => ({ group: run.heading ?? "", node: sentence(s) })),
        )}
      />
    );
  return <ProseExplainer items={prose.L4.slice(1).map(sentence)} />;
}
