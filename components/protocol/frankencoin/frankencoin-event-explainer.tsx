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
  frankencoinChallengeContent,
  frankencoinLifecycleContent,
  frankencoinEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { frankencoinEventSlots } from "@/lib/frankencoin/explainer-clauses";

export interface FrankencoinEventExplainerProps {
  ctx: FrankencoinContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Frankencoin
 *  explainer. Used by the card composer, which renders the "?" trigger on the
 *  footer row (this pane renders prose only). */
export function frankencoinLearnMoreContent(ctx: FrankencoinContext): LearnMoreContent {
  switch (ctx.eventType) {
    case "open":
    case "clone":
    case "mint":
    case "repay":
    case "add_collateral":
    case "withdraw_collateral":
    case "adjust_price":
    case "adjust":
      return frankencoinMintingContent();
    case "challenge_started":
    case "challenge_averted":
    case "challenge_succeeded":
    case "auction_settlement":
      return frankencoinChallengeContent();
    case "denied":
    case "close":
    case "forced_sale":
      return frankencoinLifecycleContent();
    default:
      return frankencoinEventFallbackContent();
  }
}

export function FrankencoinEventExplainer({ ctx, txHash, blockNumber, skipLead }: FrankencoinEventExplainerProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  const clauses = eventClauses(frankencoinEventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
