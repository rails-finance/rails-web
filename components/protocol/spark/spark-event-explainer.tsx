"use client";

// Plain-English explainer for a SparkLend event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/spark/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The near-clone of the
// Aave V3 explainer (SparkLend is a V3 fork with the same single-Pool account
// model), re-grounded in SparkLend's own semantics. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-echoed against the header / detail (and, on a liquidation, the
// forensics block).

import type { SparkContext } from "@/lib/shared/types/event-shape";
import type { SparkCoords } from "@/lib/spark/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  sparkSupplyWithdrawContent,
  sparkBorrowRepayContent,
  sparkLiquidationContent,
  sparkTransferContent,
  sparkEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { sparkEventSlots } from "@/lib/spark/explainer-clauses";
import type { AaveV3Neighbours } from "@/lib/aave-v3/event-neighbours";
import { isGatewayWithdrawal, type SparkTimelineEvent } from "@/lib/spark/liquidation-fee";
import { useSparkEventState } from "./use-spark-event-state";

export interface SparkEventExplainerProps {
  ctx: SparkContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** The position's owner: the third-party clause keys on it. */
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

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic SparkLend
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function sparkLearnMoreContent(ctx: SparkContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "supply":
    case "withdraw":
      return sparkSupplyWithdrawContent(ctx.eventType, ctx.reserveSymbol);
    case "borrow":
    case "repay":
      return sparkBorrowRepayContent(ctx.eventType, ctx.reserveSymbol);
    case "liquidation":
      return sparkLiquidationContent();
    case "transfer_out":
      // A withdrawal as ETH through the gateway reads the withdraw modal.
      return isGatewayWithdrawal(ctx)
        ? sparkSupplyWithdrawContent("withdraw", ctx.reserveSymbol)
        : sparkTransferContent();
    case "transfer_in":
      return sparkTransferContent();
    default:
      return sparkEventFallbackContent();
  }
}

export function SparkEventExplainer({
  ctx,
  txHash,
  blockNumber,
  skipLead,
  owner,
  market,
  reserveAddress,
  siblings,
  previous,
}: SparkEventExplainerProps) {
  const coords: SparkCoords = { txHash, blockNumber };
  const read = useSparkEventState({ ctx, wallet: owner, market, blockNumber, txHash, reserveAddress, previous });
  const clauses = eventClauses(
    sparkEventSlots(ctx, coords, { owner, siblings, state: read.state, previousEvent: previous?.event }),
  );
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);
  // The health-factor bullet needs the account reads; say so when they failed.
  if (read.status === "unavailable" && !read.lasting)
    items.push(<>The health factor before and after this transaction was not read. Reload to try again.</>);

  return <ProseExplainer items={items} />;
}
