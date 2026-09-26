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
// THE CAVEATS THAT HOLD FOR EVERY CARD ARE NOT HERE. They are said once, on the
// position card's Explanation pane and in `ALCHEMIX_HOW_IT_WORKS`, so each
// card's bullets are about its own event.

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
  /** The line facts and the redemption figure the bullets name. */
  prose: AlchemixCardProse;
}

const BORROWING: LearnMoreContent = {
  title: "Borrowing against vault shares",
  intro:
    "Collateral goes in as shares of a vault that lends out the asset underneath (mixUSDC is a vault over USDC). The position mints a synthetic token against those shares, alUSD or alETH, and that is its debt.",
  detailsHeading: "What moves the two sides",
  details: [
    { bold: "Deposit and withdraw", text: "move the vault shares the position holds." },
    { bold: "Mint and burn", text: "move the debt one for one, and the holder chooses both." },
    {
      bold: "Repay",
      text: "pays the debt with vault shares. Each share counts at its value in the asset underneath at that block, one synthetic per unit, and the line keeps a protocol fee in shares on the part that pays off debt set aside for repayment (0.25% on Ethereum, 0.1% on Base).",
    },
    {
      bold: "Set aside for repayment",
      text: "is the part of the debt the Transmuter has claimed as its stakers' deposits matured. It grows block by block, and the line's next redemption clears it. See How Alchemix repays a loan, on a redemption card or the position card.",
    },
  ],
};

/** The protocol's central idea, the one a reader has to own to read an
 *  Alchemix timeline: Transmuter stakes maturing are what set debt aside and
 *  what redemptions clear. Opened from every redemption card and from the
 *  position card's Explanation pane. */
export const ALCHEMIX_HOW_IT_WORKS: LearnMoreContent = {
  title: "How Alchemix repays a loan",
  intro:
    "Every Alchemix line has two halves. The Alchemist holds borrowers' positions: vault shares in, a synthetic token such as alUSD out. The Transmuter takes that synthetic back from anyone who holds it and, over time, turns it into the vault shares borrowers put up. The second half is what repays the first.",
  stepsHeading: "How a redemption happens",
  steps: [
    "Someone holding alUSD deposits it in the line's Transmuter, where it matures over a period measured in blocks.",
    "As those deposits mature, the Alchemist sets aside a matching amount of debt across every open position on the line. That is each position's Set aside for repayment figure, and it grows block by block.",
    "When a staker claims, the Transmuter redeems: every open position's set-aside debt is cleared by the same ratio, and a matching slice of its collateral moves to the Transmuter: vault shares worth one unit of the asset underneath (USDC, or WETH on alETH) for each unit of debt cleared.",
    "The Transmuter pays the staker in those vault shares (mixUSDC on the alUSD line) for the part of the deposit that has matured, and hands back the rest as alUSD.",
  ],
  detailsHeading: "What it means for a borrower",
  details: [
    {
      bold: "The loan is repaid over time without the holder acting.",
      text: "Each redemption lowers the debt and the collateral by matching values, so the position's collateral less its debt stays about where it was.",
    },
    {
      bold: "The vault's share price decides what is left over.",
      text: "A rising share price grows the collateral while the debt stays put. A share price can also fall, and then the collateral shrinks.",
    },
    {
      bold: "A redemption row is the line's event.",
      text: "It names no position. The explorer reads each position before and after it to state what it cleared and took from that one.",
    },
    {
      bold: "The holder can still repay directly",
      text: "by burning the synthetic or repaying with vault shares, or close out with a self-liquidation, which pays the debt from the collateral.",
    },
    {
      bold: "A position that falls too low can be liquidated by anyone.",
      text: "Its collateralisation is the collateral in the asset underneath divided by the debt, with one synthetic counted as one unit of that asset. Minting more or withdrawing must leave it above the line's minimum. If a falling share price takes it to the line's liquidation line or below, anyone can liquidate the position: the Alchemist uses its collateral to repay debt until the ratio is back above the minimum, and pays the liquidator a fee from it. The position card states both lines, read from the Alchemist, and how many liquidations the line has had.",
    },
  ],
};

const LIQUIDATION: LearnMoreContent = {
  title: "When a position is liquidated",
  intro:
    "A position whose collateral no longer covers its debt can have shares taken from it and put against the debt. The holder can do it themselves, or anyone can do it and take a fee for it.",
  detailsHeading: "What the event states",
  details: [
    { bold: "Shares taken", text: "are in the log, so they are shown." },
    { bold: "Debt cleared", text: "shows in the card's before and after figures." },
    { bold: "The fee", text: "is paid to whoever did it, in shares and in the asset underneath." },
  ],
};

const LINE_WIDE: LearnMoreContent = {
  title: "Events that belong to the whole line",
  intro:
    "Some events on this timeline name no position at all. They are here because they fell inside this position's life, and the holder did none of them.",
  detailsHeading: "The kinds",
  details: [
    {
      bold: "Redemption",
      text: "clears every open position's set-aside debt on the line at once, by one ratio, and takes a matching slice of each one's collateral for the Transmuter.",
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
      return ALCHEMIX_HOW_IT_WORKS;
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

/** What a card's bullets need beyond its legs: the line's share ticker, its
 *  fee rate, and what a redemption took from the collateral. */
export interface AlchemixCardProse {
  underlyingDecimals: number | null;
  mytSymbol: string;
  protocolFeeBps: number | null;
  collateralTakenRaw: string | null;
}

/** Every bullet the card can show, teaser included. */
function alchemixCardClauses(
  legs: AlchemistEvent[],
  siblings: AlchemistEvent[],
  prose: AlchemixCardProse,
): ClauseInput[] {
  const combined = legs.length > 1;
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
        skipCustody: roundTrip != null,
        underlyingDecimals: prose.underlyingDecimals,
        mytSymbol: prose.mytSymbol,
        protocolFeeBps: prose.protocolFeeBps,
        collateralTakenRaw: prose.collateralTakenRaw,
      }),
    ),
    ...(roundTrip ? [alchemixCustodyRoundTripClause(roundTrip)] : []),
    ...readingClauses,
  ];
}

/** The teaser: the first bullet, rendered on the card face. */
export function alchemixExplainerTeaser(legs: AlchemistEvent[], siblings: AlchemistEvent[], prose: AlchemixCardProse) {
  return splitLead(alchemixCardClauses(legs, siblings, prose)).lead;
}

export function AlchemixEventExplainer({ legs, siblings, skipLead, prose }: AlchemixEventExplainerProps) {
  const clauses = alchemixCardClauses(legs, siblings, prose);
  const items = composeBullets(skipLead ? splitLead(clauses).rest : clauses);
  return <ProseExplainer items={items} />;
}
