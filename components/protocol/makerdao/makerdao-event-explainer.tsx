"use client";

// Plain-English explainer for a Maker vault event — a layman PARAGRAPH (not
// bullets), composed from state-keyed clauses in lib/makerdao/explainer-clauses.tsx,
// plus the per-event "Learn More" modal on the mechanic. The card shows the
// paragraph's LEAD sentence as its teaser; this pane renders the REST (skipLead),
// so the first sentence is never duplicated. Every figure here is the card's own
// face value, Prov-traced (an echo of the header delta / detail grid / forensics
// receipt); the debt is quoted in DAI (or USDS), muted, because the chrome
// carries the vault's normalized figure, not this valued one.
//
// A frob is ONE vault operation carrying two signed deltas — collateral and
// debt — so the narration decomposes the pair: deposit, withdraw, draw, repay,
// or a combination in one transaction.

import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import type { MakerCoords } from "@/lib/makerdao/event-provenance";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { makerdaoVaultContent, makerdaoLiquidationContent } from "@/lib/shared/learn-more-content";
import { composeBullets, eventClauses, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { makerdaoEventSlots } from "@/lib/makerdao/explainer-clauses";

export interface MakerDAOEventExplainerProps {
  ctx: MakerDAOContext;
  txHash?: string;
  blockNumber?: number;
  /** The card shows the lead sentence as the teaser; render only the rest here. */
  skipLead?: boolean;
}

/** Mechanic modal content for this event — never-empty floor: every event type
 *  maps to a modal (fork and give ride the vault-operations content; the grab
 *  and LockStake auction rows ride the liquidation content). Used by the card
 *  composer, which renders the "?" trigger on the footer row (this pane
 *  renders prose only). */
export function makerdaoLearnMoreContent(ctx: MakerDAOContext): LearnMoreContent {
  return ctx.eventType === "grab" || ctx.eventType.startsWith("lse-")
    ? makerdaoLiquidationContent()
    : makerdaoVaultContent(ctx.isOpen ? "open" : "adjust");
}

export function MakerDAOEventExplainer({ ctx, txHash, blockNumber, skipLead }: MakerDAOEventExplainerProps) {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };
  const clauses = eventClauses(makerdaoEventSlots(ctx, coords));
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);

  return <ProseExplainer items={items} />;
}
