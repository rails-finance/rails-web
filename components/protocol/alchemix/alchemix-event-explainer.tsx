"use client";

// Plain-words pane for one Alchemist transaction. The clauses are in
// lib/alchemix/explainer-clauses.tsx; this file wires them into the shared
// pane and picks the mechanic modal.
//
// The card shows the first bullet as its teaser, so the pane renders the rest
// (skipLead) and nothing is said twice.
//
// THE OPENING'S NARRATION LEADS. An opening's logs arrive in the chain's own
// order, which puts the NFT's mint after the deposit that funded it, so the
// teaser would otherwise be "the position took in N vault shares" under a label
// reading `Open`. The mint is the leg that narrates the whole transaction, so
// its bullets go first; every other card keeps log order.
//
// THE READING'S CAVEATS COME LAST. They govern the grid above the pane rather
// than any one leg, and they are what replaced the paragraph that used to sit
// on the card face once per leg.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { composeBullets, splitLead, ProseExplainer, type ClauseInput } from "@/lib/shared/explainer-prose";
import {
  alchemixCustodyRoundTripClause,
  alchemixEventClauses,
  alchemixReadingClauses,
  custodyPathInTx,
  type AlchemistEvent,
} from "@/lib/alchemix/explainer-clauses";

export interface AlchemixEventExplainerProps {
  /** The legs of one transaction this card draws, in log order. */
  legs: AlchemistEvent[];
  /** Every row sharing the transaction, filtered or not. It is what tells a
   *  forwarding hop from a change of owner. */
  siblings: AlchemistEvent[];
  /** The card shows the lead bullet as its teaser; render only the rest. */
  skipLead?: boolean;
  /** The decimals of the asset under this line's MYT, from the position's own
   *  row. Carried for the two fees paid in that asset, which are 6-decimal
   *  figures on the USDC lines and 18-decimal ones on the WETH line. */
  underlyingDecimals?: number | null;
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

/** The mechanic a whole transaction is about. A custody leg rides along with
 *  an opening and with a hand-over that moved an axis in the same transaction;
 *  what the reader needs explained there is the axis, so the leg that moved one
 *  chooses the modal and a transaction of transfers alone keeps custody. */
export function alchemixLearnMoreFor(legs: AlchemistEvent[]): LearnMoreContent {
  const lead = legs.find((l) => l.context.data.eventType !== "transfer") ?? legs[0];
  return alchemixLearnMoreContent(lead.context.data);
}

/** The legs in the order their bullets read: an opening's narrator first (see
 *  the header note), log order otherwise. */
function proseOrder(legs: AlchemistEvent[]): AlchemistEvent[] {
  if (legs.length < 2) return legs;
  const mintIdx = legs.findIndex((l) => l.context.data.transfer?.transferType === "mint");
  if (mintIdx < 1) return legs;
  return [legs[mintIdx], ...legs.filter((_, i) => i !== mintIdx)];
}

/** Every bullet the card can show, teaser included. */
function alchemixCardClauses(
  legs: AlchemistEvent[],
  siblings: AlchemistEvent[],
  underlyingDecimals: number | null,
): ClauseInput[] {
  const combined = legs.length > 1;
  // The reading's own bullets state the share unit, so the deposit's
  // continuation saying it a second time is dropped.
  const reading = legs.find((l) => l.context.data.stateAtBlockFromReading?.status === "stated")?.context.data
    .stateAtBlockFromReading;
  const readingClauses = alchemixReadingClauses(reading, legs.length);
  // A custody ROUND TRIP inside one transaction is one fact, not one per hop:
  // the NFT went out to a contract that acted with it and came back, and each
  // hop read alone would narrate a change of owner that did not happen.
  const path = combined
    ? custodyPathInTx(legs, legs.find((l) => l.context.data.tokenId != null)?.context.data.tokenId ?? null)
    : null;
  const roundTrip = path && !path.moved && !path.burnedFrom && path.moves.length > 1 ? path : null;
  return [
    ...proseOrder(legs).flatMap((leg) =>
      alchemixEventClauses(leg.context.data, siblings, leg, {
        combined,
        skipShareUnit: readingClauses.length > 0,
        skipCustody: roundTrip != null,
        underlyingDecimals,
      }),
    ),
    ...(roundTrip ? [alchemixCustodyRoundTripClause(roundTrip)] : []),
    ...readingClauses,
  ];
}

/** The teaser: the first bullet, rendered on the card face. */
export function alchemixExplainerTeaser(
  legs: AlchemistEvent[],
  siblings: AlchemistEvent[],
  underlyingDecimals: number | null = null,
) {
  return splitLead(alchemixCardClauses(legs, siblings, underlyingDecimals)).lead;
}

export function AlchemixEventExplainer({
  legs,
  siblings,
  skipLead,
  underlyingDecimals = null,
}: AlchemixEventExplainerProps) {
  const clauses = alchemixCardClauses(legs, siblings, underlyingDecimals);
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);
  return <ProseExplainer items={items} />;
}
