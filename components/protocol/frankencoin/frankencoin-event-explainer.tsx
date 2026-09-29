"use client";

// Plain-English explainer for a Frankencoin event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/frankencoin/explainer-
// clauses.tsx, plus the per-event "Learn More" modal on the mechanic. The card
// shows the paragraph's LEAD sentence as its teaser; this pane renders the REST
// (skipLead), so the first sentence is never duplicated. Every figure here is the
// card's own face value, Prov-echoed against the header's moved amounts or the
// detail grid's after-absolutes / declared price. Third person throughout; native
// units only (ZCHF debt, the position's own collateral token) — Frankencoin runs
// no oracle and no USD renders.

import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import type { FrankencoinCoords } from "@/lib/frankencoin/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import {
  frankencoinMintingContent,
  frankencoinPriceContent,
  frankencoinCreationContent,
  frankencoinOwnershipContent,
  frankencoinChallengeContent,
  frankencoinLifecycleContent,
  frankencoinForcedSaleContent,
  frankencoinEventFallbackContent,
  type FrankencoinModalForcedSale,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { frankencoinEventSlots } from "@/lib/frankencoin/explainer-clauses";
import { frankencoinZchfSplit, useFrankencoinEventRead } from "@/lib/frankencoin/use-event-read";
import { useFrankencoinPageFacts, type FrankencoinPageFacts } from "@/lib/frankencoin/page-facts";

export interface FrankencoinEventExplainerProps {
  ctx: FrankencoinContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
  /** The event's unix time, for the dates a price raise sets. */
  timestamp?: number;
  /** The event id, whose log index isolates this event's receipt logs. */
  eventId?: string;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Frankencoin
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function frankencoinLearnMoreContent(
  ctx: FrankencoinContext,
  facts?: FrankencoinPageFacts | null,
  txHash?: string,
  forcedExample?: FrankencoinModalForcedSale | null,
): LearnMoreContent {
  const forcedTx = txHash != null && (facts?.txKinds[txHash] ?? []).includes("forced_sale");
  const forced = () =>
    frankencoinForcedSaleContent({ phase: facts?.challengePeriod ?? null, example: forcedExample ?? null });
  // A combined adjust that moves the declared price changes the position's
  // terms: the price modal explains the raise and its minting pause.
  const priceMoved = ctx.liqPrice != null && ctx.liqPriceBefore != null && ctx.liqPrice !== ctx.liqPriceBefore;
  switch (ctx.eventType) {
    case "open":
      return frankencoinCreationContent("open");
    case "clone":
      return frankencoinCreationContent("clone");
    case "ownership_transferred":
      return ctx.initialization ? frankencoinCreationContent("handover") : frankencoinOwnershipContent();
    case "adjust":
      return priceMoved ? frankencoinPriceContent() : frankencoinMintingContent();
    case "mint":
    case "repay":
    case "add_collateral":
    case "withdraw_collateral":
      return frankencoinMintingContent();
    case "adjust_price":
      return frankencoinPriceContent();
    case "challenge_started":
    case "challenge_averted":
    case "challenge_succeeded":
    case "auction_settlement":
      if (ctx.eventType === "auction_settlement" && forcedTx) return forced();
      return frankencoinChallengeContent({
        phase: facts?.challengePeriod ?? null,
        example: facts?.saleExample ?? null,
      });
    case "forced_sale":
      return forced();
    case "denied":
    case "close":
      return frankencoinLifecycleContent();
    default:
      return frankencoinEventFallbackContent();
  }
}

export function FrankencoinEventExplainer({
  ctx,
  txHash,
  blockNumber,
  skipLead,
  timestamp,
  eventId,
}: FrankencoinEventExplainerProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  // The same receipt read the opened grid makes; one request serves both.
  const { read } = useFrankencoinEventRead(ctx, txHash, eventId);
  const facts = useFrankencoinPageFacts();
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? Number(ctx.minted) - Number(ctx.mintedBefore) : 0;
  const split = frankencoinZchfSplit(read, dMint);
  const clauses = eventClauses(frankencoinEventSlots(ctx, coords, { split, read, facts, timestamp, txHash }));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
