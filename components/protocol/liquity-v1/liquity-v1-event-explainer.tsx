"use client";

// The Explanation pane (zone Z2) of a Liquity V1 Trove event: the generator's
// sentences (lib/liquity-v1/event-prose.ts, its strings in
// content/liquity-v1/event-prose.yaml), one bullet each, under the three
// event headings when two of them hold two or more bullets. Each figure the
// header also prints echoes the header's receipt.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { useLedgerDecimals } from "@/components/shared/event-ledger-context";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { liquityV1EventProse, liquityV1ExplanationRuns, type LiquityV1EchoKey } from "@/lib/liquity-v1/event-prose";
import {
  closeRepaidProv,
  collDeltaProv,
  debtDeltaProv,
  drawReceivedProv,
  type LiquityV1Coords,
} from "@/lib/liquity-v1/event-provenance";
import { COLLATERAL_SYMBOL, DEBT_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { LIQUITY_V1_RESERVE, sidesOf } from "@/lib/liquity-v1/event-figures";
import { useLiquityV1EventReadState } from "@/lib/liquity-v1/use-event-read";
import type { LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { liquityV1EventPrice } from "./liquity-v1-event-detail";

export interface LiquityV1EventExplainerProps {
  ctx: LiquityV1Context;
  txHash?: string;
  blockNumber?: number;
  /** The Trove's owner: the receipt read filters on it. */
  wallet?: string;
  /** On a liquidation, what the Trove's life left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
}

/** The event's "?" modal (it depends on the event's kind only). */
export function liquityV1LearnMoreContent(ctx: LiquityV1Context): LearnMoreContent {
  return liquityV1EventProse({ ctx }).L5.content;
}

/** The header's receipt each echoed figure registers against. The header
 *  prints a bare magnitude on opens, adjusts, redemptions and liquidations and
 *  a signed one on a close, so the echo keys its value the same way. */
function echoFor(key: LiquityV1EchoKey, ctx: LiquityV1Context, coords: LiquityV1Coords): ProseEcho | null {
  const s = sidesOf(ctx);
  const labeled = ctx.eventType !== "closeTrove";
  switch (key) {
    case "coll_change":
      return {
        info: collDeltaProv(coords, {
          after: ctx.collAfter,
          before: ctx.collAfter != null ? Number(ctx.collAfter) - s.collDelta : null,
        }),
        value: chainTruthDeltaValue(s.collDelta, labeled),
        symbol: COLLATERAL_SYMBOL,
      };
    case "debt_change":
      return {
        info: debtDeltaProv(coords, {
          after: ctx.debtAfter,
          before: ctx.debtAfter != null ? Number(ctx.debtAfter) - s.debtDelta : null,
        }),
        value: chainTruthDeltaValue(s.debtDelta, labeled),
        symbol: DEBT_SYMBOL,
      };
    case "received":
      return ctx.lusdReceived != null && ctx.borrowingFee != null
        ? {
            info: drawReceivedProv(coords, {
              debtAdded: ctx.debtDelta,
              fee: ctx.borrowingFee,
              open: ctx.eventType === "openTrove",
            }),
            value: chainTruthDeltaValue(Number(ctx.lusdReceived), labeled),
            symbol: DEBT_SYMBOL,
          }
        : null;
    case "repaid":
      return {
        info: closeRepaidProv(coords, ctx.debtBefore),
        value: chainTruthDeltaValue(-Math.max(0, Math.abs(s.debtDelta) - LIQUITY_V1_RESERVE), false),
        symbol: DEBT_SYMBOL,
      };
  }
}

export function LiquityV1EventExplainer({
  ctx,
  txHash,
  blockNumber,
  wallet,
  ownerOutcome,
}: LiquityV1EventExplainerProps) {
  const coords: LiquityV1Coords = { txHash, blockNumber };
  // The same read the opened grid makes; the hooks share one request.
  const { read } = useLiquityV1EventReadState(txHash, wallet);
  const collDecimals = useLedgerDecimals("collateral");
  const prose = liquityV1EventProse({ ctx, read, price: liquityV1EventPrice(ctx, read), ownerOutcome, collDecimals });
  const echo = (key: LiquityV1EchoKey) => echoFor(key, ctx, coords);
  const items = liquityV1ExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  return <ProseExplainer items={items} />;
}
