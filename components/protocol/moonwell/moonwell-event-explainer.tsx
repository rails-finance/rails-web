"use client";

// The Explanation pane (zone Z2) of a Moonwell event: the generator's sentences
// (lib/moonwell/event-prose.ts, its strings in content/moonwell/event-prose.yaml),
// one bullet each, under the three event headings when two of them hold two or
// more bullets. Each figure the header or the detail grid also prints echoes
// that receipt. The "?" modal is the generator's too (the event's kind picks
// it). Moonwell's stream carries no cross-transaction sibling figure, so a
// liquidation states both its legs.

import type { MoonwellContext } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { useMoonwellCoords } from "@/lib/moonwell/deployment-context";
import { moonwellEventProse, moonwellExplanationRuns, type MoonwellEchoKey } from "@/lib/moonwell/event-prose";
import { MOONWELL_WORDS } from "@/lib/moonwell/event-templates";
import {
  assetsDeltaProv,
  liqDebtRepaidProv,
  mTokensDeltaProv,
  seizeTokensProv,
  transferAmountProv,
  type MoonwellCoords,
} from "@/lib/moonwell/event-provenance";
import { formatNumber } from "@/lib/utils/format";

export interface MoonwellEventExplainerProps {
  ctx: MoonwellContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** A third party executed the event (owner neither signer nor party). */
  externalBy?: string;
}

/** The event's "?" modal: every event type maps to one, the default falling
 *  back to the generic Moonwell explainer. */
export function moonwellLearnMoreContent(ctx: MoonwellContext, coords: MoonwellCoords): LearnMoreContent {
  return moonwellEventProse({ ctx, mtoken: coords.mtoken, marketLabel: coords.marketLabel }).L5.content;
}

/** The receipt each echoed figure registers against: the spine flank's delta,
 *  or the detail grid's liquidation legs. */
function echoFor(key: MoonwellEchoKey, ctx: MoonwellContext, coords: MoonwellCoords): ProseEcho | null {
  const sym = ctx.marketSymbol ?? MOONWELL_WORDS.the_asset;
  const mSym = coords.marketLabel ?? `m${sym}`;
  const mDelta = chainTruthDeltaValue(Number(ctx.mTokensDelta), false);
  switch (key) {
    case "amount":
      return {
        info: assetsDeltaProv(sym, ctx.eventType as "mint" | "redeem" | "borrow" | "repay", coords, ctx.raw?.amount),
        value: chainTruthDeltaValue(Number(ctx.assetsDelta), false),
        symbol: sym,
      };
    case "mtokens":
      return {
        info: mTokensDeltaProv(mSym, ctx.eventType as "mint" | "redeem", coords, ctx.raw?.mTokens),
        value: mDelta,
        symbol: mSym,
      };
    case "mtokens_in":
      return { info: transferAmountProv(mSym, "in", coords, ctx.raw?.mTokens), value: mDelta, symbol: mSym };
    case "mtokens_out":
      return { info: transferAmountProv(mSym, "out", coords, ctx.raw?.mTokens), value: mDelta, symbol: mSym };
    case "repaid":
      return {
        info: liqDebtRepaidProv(sym, coords, ctx.raw?.amount),
        value: formatNumber(Math.abs(Number(ctx.assetsDelta))),
        symbol: sym,
      };
    case "seized": {
      if (ctx.seizeTokens == null || !ctx.collateralSymbol) return null;
      const collMSym = `m${ctx.collateralSymbol}`;
      return {
        info: seizeTokensProv(collMSym, coords, ctx.raw?.seizeTokens),
        value: formatNumber(Number(ctx.seizeTokens)),
        symbol: collMSym,
      };
    }
  }
}

export function MoonwellEventExplainer({ ctx, txHash, blockNumber, wallet, externalBy }: MoonwellEventExplainerProps) {
  const coords = useMoonwellCoords({ market: ctx.market, symbol: ctx.marketSymbol, txHash, blockNumber, wallet });
  const prose = moonwellEventProse({ ctx, externalBy, mtoken: coords.mtoken, marketLabel: coords.marketLabel });
  const echo = (key: MoonwellEchoKey) => echoFor(key, ctx, coords);
  const items = moonwellExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  return <ProseExplainer items={items} />;
}
