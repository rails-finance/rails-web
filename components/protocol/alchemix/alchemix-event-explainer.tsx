"use client";

// Plain-words pane for one Alchemist event. The clauses are in
// lib/alchemix/explainer-clauses.tsx; this file wires them into the shared
// pane and picks the mechanic modal.
//
// The card shows the first bullet as its teaser, so the pane renders the rest
// (skipLead) and nothing is said twice.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { composeBullets, splitLead, ProseExplainer } from "@/lib/shared/explainer-prose";
import { alchemixEventClauses, type AlchemistEvent } from "@/lib/alchemix/explainer-clauses";

export interface AlchemixEventExplainerProps {
  ctx: AlchemixV3Context;
  /** The rows sharing this event's transaction, and this row among them. An
   *  opening takes three logs to state, and the mint card narrates it. */
  siblings?: AlchemistEvent[];
  self?: AlchemistEvent;
  /** The card shows the lead bullet as its teaser; render only the rest. */
  skipLead?: boolean;
}

const BORROWING: LearnMoreContent = {
  title: "Borrowing against a yield position",
  intro:
    "Collateral goes in as shares of a vault that earns yield. The position mints a synthetic token against those shares, and the yield the vault earns is set aside against the debt over time, so the debt falls on its own.",
  detailsHeading: "What moves the two sides",
  details: [
    { bold: "Deposit and withdraw", text: "move the vault shares the position holds." },
    { bold: "Mint and burn", text: "move the debt directly, and the holder chooses both." },
    {
      bold: "Repay",
      text: "offers vault shares against the debt. What they clear depends on what a share is worth at that moment, and it stops at whichever is smaller, this position's debt or the line's.",
    },
    {
      bold: "Set aside for repayment",
      text: "grows every block as the vault earns. It is a figure with a block attached, never a running balance.",
    },
  ],
};

const LIQUIDATION: LearnMoreContent = {
  title: "When a position is liquidated",
  intro:
    "A position whose collateral no longer covers its debt can have shares taken from it and put against the debt. The holder can do it themselves, or anyone can do it and take a fee for it.",
  detailsHeading: "What the event states",
  details: [
    { bold: "Shares taken", text: "is in the log, so it is shown." },
    {
      bold: "Debt cleared",
      text: "is not in the log. No figure is given for it here rather than one worked out from something else.",
    },
    { bold: "The fee", text: "is paid to whoever did it, in shares and in the asset underneath." },
  ],
};

const LINE_WIDE: LearnMoreContent = {
  title: "Events that belong to the whole line",
  intro:
    "Three kinds of event on this timeline name no position at all. They are here because they are what moved this position's figures, and never because the holder did anything.",
  detailsHeading: "The three",
  details: [
    {
      bold: "Redemption",
      text: "moves every open position's debt on the line at once, by one ratio, with nothing in any position's own events to see. It is why the figures on a line that has had one are taken from the contract rather than worked out from the events.",
    },
    {
      bold: "Batch liquidation",
      text: "carries the list of positions as a single hash, so which ones were in it cannot be recovered.",
    },
    { bold: "Fee shortfall", text: "records a liquidator being paid less than they were owed." },
  ],
};

const CUSTODY: LearnMoreContent = {
  title: "The position is a token that can be sold",
  intro:
    "An Alchemix position is an NFT. It can change hands at any time without the debt or the collateral moving, and without the position closing.",
  extraParagraphs: [
    "So the address holding it today need not be the address that opened it, or the address that did any of what is on this page. Each event says who acted in it.",
  ],
};

export function alchemixLearnMoreContent(ctx: AlchemixV3Context): LearnMoreContent {
  switch (ctx.eventType) {
    case "liquidated":
    case "self_liquidated":
    case "force_repay":
    case "repayment_fee":
      return LIQUIDATION;
    case "redemption":
    case "batch_liquidated":
    case "fee_shortfall":
      return LINE_WIDE;
    case "transfer":
      return CUSTODY;
    default:
      return BORROWING;
  }
}

/** The teaser: the first bullet, rendered on the card face. */
export function alchemixExplainerTeaser(ctx: AlchemixV3Context, siblings?: AlchemistEvent[], self?: AlchemistEvent) {
  return splitLead(alchemixEventClauses(ctx, siblings, self)).lead;
}

export function AlchemixEventExplainer({ ctx, siblings, self, skipLead }: AlchemixEventExplainerProps) {
  const clauses = alchemixEventClauses(ctx, siblings, self);
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);
  return <ProseExplainer items={items} />;
}
