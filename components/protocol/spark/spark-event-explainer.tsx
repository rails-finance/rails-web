"use client";

// The Explanation pane (zone Z2) of a SparkLend event: the generator's
// sentences (lib/spark/event-prose.ts, its strings in
// content/spark/event-prose.yaml), one bullet each, under the three event
// headings when two of them hold two or more bullets. Each figure the header
// or the liquidation's forensics block also prints echoes that receipt. The
// "?" modal is the generator's too (the event's kind picks it).

import type { SparkContext } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { ProseSentenceText, type ProseEcho } from "@/components/shared/prose-sentence-text";
import { liquidationBonus, sparkEventProse, sparkExplanationRuns, type SparkEchoKey } from "@/lib/spark/event-prose";
import { SPARK_WORDS, sparkModal } from "@/lib/spark/event-templates";
import {
  assetsDeltaProv,
  debtRepaidProv,
  liqPremiumProv,
  seizedCollateralProv,
  transferDeltaProv,
  type SparkCoords,
} from "@/lib/spark/event-provenance";
import type { AaveV3Neighbours } from "@/lib/aave-v3/event-neighbours";
import { formatUsdValue } from "@/lib/utils/format";
import { isGatewayWithdrawal, sparkLiquidationFee, type SparkTimelineEvent } from "@/lib/spark/liquidation-fee";
import { useSparkEventState } from "./use-spark-event-state";

export interface SparkEventExplainerProps {
  ctx: SparkContext;
  txHash?: string;
  blockNumber?: number;
  /** The position's owner: the third-party sentence keys on it. */
  owner?: string;
  /** With `market`, the prose reads the account state the open card reads
   *  (one shared request each, lib/spark/event-state). */
  market?: "spark";
  reserveAddress?: string;
  /** This transaction's rows (a liquidation and its fee transfer). */
  siblings?: SparkTimelineEvent[];
  /** The previous transaction, to say what moved the account between events. */
  previous?: AaveV3Neighbours<SparkTimelineEvent>["previous"];
}

/** The event's "?" modal: every event type maps to one, the default falling
 *  back to the generic SparkLend explainer. A withdrawal as ETH through the
 *  gateway reads the withdraw modal. */
export function sparkLearnMoreContent(ctx: SparkContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "supply":
      return sparkModal("supply");
    case "withdraw":
      return sparkModal("withdraw");
    case "borrow":
      return sparkModal("borrow");
    case "repay":
      return sparkModal("repay");
    case "liquidation":
      return sparkModal("liquidation");
    case "transfer_out":
      return isGatewayWithdrawal(ctx) ? sparkModal("withdraw") : sparkModal("transfer");
    case "transfer_in":
      return sparkModal("transfer");
    default:
      return sparkModal("fallback");
  }
}

/** The receipt each echoed figure registers against: the header's delta, or the
 *  liquidation forensics block's premium. */
function echoFor(
  key: SparkEchoKey,
  ctx: SparkContext,
  coords: SparkCoords,
  siblings: SparkTimelineEvent[] | undefined,
): ProseEcho | null {
  const sym = ctx.reserveSymbol;
  const collSym = ctx.collateralSymbol ?? sym;
  const delta = chainTruthDeltaValue(Number(ctx.assetsDelta), false);
  switch (key) {
    case "amount":
      return { info: assetsDeltaProv(sym, ctx.side, coords), value: delta, symbol: sym };
    case "amount_in":
      return { info: transferDeltaProv(sym, "in", coords), value: delta, symbol: sym };
    case "amount_out":
      return { info: transferDeltaProv(sym, "out", coords), value: delta, symbol: sym };
    case "seized":
      return { info: seizedCollateralProv(collSym, coords), value: delta, symbol: collSym };
    case "cleared":
      return {
        info: debtRepaidProv(sym, coords),
        value: chainTruthDeltaValue(Number(ctx.debtDelta), false),
        symbol: sym,
      };
    case "premium": {
      const b = liquidationBonus(ctx, sparkLiquidationFee(ctx, siblings));
      if (!b) return null;
      const text = `${b.premium >= 0 ? "+" : "−"}${(Math.abs(b.premium) * 100).toFixed(2)}%`;
      return {
        info: liqPremiumProv(coords, {
          seizedUsd: formatUsdValue(b.seizedUsd),
          clearedUsd: formatUsdValue(b.clearedUsd),
        }),
        value: text,
      };
    }
  }
}

export function SparkEventExplainer({
  ctx,
  txHash,
  blockNumber,
  owner,
  market,
  reserveAddress,
  siblings,
  previous,
}: SparkEventExplainerProps) {
  const coords: SparkCoords = { txHash, blockNumber };
  const read = useSparkEventState({ ctx, wallet: owner, market, blockNumber, txHash, reserveAddress, previous });
  const prose = sparkEventProse({ ctx, owner, siblings, state: read.state });
  const echo = (key: SparkEchoKey) => echoFor(key, ctx, coords, siblings);
  const items = sparkExplanationRuns(prose).flatMap((run) =>
    run.sentences.map((s) => {
      const node = <ProseSentenceText key={s.sentence_id} s={s} echo={echo} />;
      return run.heading ? { group: run.heading, node } : node;
    }),
  );
  // The health factor sentences need the account reads; say so when they failed.
  if (read.status === "unavailable" && !read.lasting) items.push(<>{SPARK_WORDS.unread}</>);
  return <ProseExplainer items={items} />;
}
