"use client";

// Plain-English explainer for a Moonwell event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/moonwell/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-echoed (the spine flank for deltas, the detail grid for the
// after-balances / emitted debt total / liquidation legs). Moonwell's stream
// carries no cross-transaction sibling figure, so there is nothing to narrate
// across cards — a liquidation states both its own legs.

import type { MoonwellContext } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { BASE_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { useMoonwellCoords } from "@/lib/moonwell/deployment-context";
import {
  moonwellSupplyWithdrawContent,
  moonwellBorrowRepayContent,
  moonwellTransferContent,
  moonwellLiquidationContent,
  moonwellEventFallbackContent,
} from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { moonwellEventSlots } from "@/lib/moonwell/explainer-clauses";

export interface MoonwellEventExplainerProps {
  ctx: MoonwellContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** A third party executed the event (owner neither signer nor party). */
  externalBy?: string;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal, the default falling back to the generic Moonwell explainer.
 *  Used by the card composer, which renders the "?" trigger on the footer row
 *  (this pane renders prose only). */
export function moonwellLearnMoreContent(ctx: MoonwellContext, chainId?: ChainId): LearnMoreContent {
  const deployment = chainId === BASE_CHAIN_ID ? "base" : "ethereum";
  switch (ctx.eventType) {
    case "mint":
    case "redeem":
      return moonwellSupplyWithdrawContent(ctx.eventType);
    case "borrow":
    case "repay":
      return moonwellBorrowRepayContent(ctx.eventType, deployment);
    case "transfer_in":
    case "transfer_out":
      return moonwellTransferContent(ctx.eventType);
    case "liquidation":
      return moonwellLiquidationContent();
    default:
      return moonwellEventFallbackContent(deployment);
  }
}

export function MoonwellEventExplainer({
  ctx,
  txHash,
  blockNumber,
  wallet,
  externalBy,
  skipLead,
}: MoonwellEventExplainerProps) {
  const coords = useMoonwellCoords({ market: ctx.market, symbol: ctx.marketSymbol, txHash, blockNumber, wallet });
  const clauses = eventClauses(moonwellEventSlots(ctx, coords, { externalBy }));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
