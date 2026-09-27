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
// position card (its Explanation pane and its "?", `alchemixPositionContent`), so each
// card's bullets are about its own event.

import type { AlchemixV3Context } from "@/lib/shared/types/event-shape";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { RedemptionNet } from "@/lib/alchemix/redemption-net";
import type { AlchemixReading } from "@/lib/alchemix/readings-before";
import { clause, composeBullets, splitLead, ProseExplainer, type ClauseInput } from "@/lib/shared/explainer-prose";
import { formatGasCost } from "@/lib/shared/format-event";
import {
  alchemixCustodyRoundTripClause,
  alchemixEventClauses,
  alchemixReadingClauses,
  custodyPathInTx,
  type AlchemistEvent,
} from "@/lib/alchemix/explainer-clauses";
import {
  ALCHEMIX_BURN_REPAY,
  ALCHEMIX_CUSTODY,
  ALCHEMIX_HOW_IT_WORKS,
  ALCHEMIX_LINE_WIDE,
  ALCHEMIX_LIQUIDATION,
  ALCHEMIX_MINT,
  ALCHEMIX_OPEN_DEPOSIT,
  ALCHEMIX_SELF_LIQUIDATE,
  ALCHEMIX_WITHDRAW,
} from "@/lib/alchemix/learn-more";

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

export function alchemixLearnMoreContent(ctx: AlchemixV3Context): LearnMoreContent {
  switch (ctx.eventType) {
    case "deposit":
      return ALCHEMIX_OPEN_DEPOSIT;
    case "mint":
      return ALCHEMIX_MINT;
    case "burn":
    case "repay":
      return ALCHEMIX_BURN_REPAY;
    case "withdraw":
      return ALCHEMIX_WITHDRAW;
    case "self_liquidated":
      return ALCHEMIX_SELF_LIQUIDATE;
    case "liquidated":
    case "force_repay":
    case "repayment_fee":
      return ALCHEMIX_LIQUIDATION;
    case "redemption":
      return ALCHEMIX_HOW_IT_WORKS;
    case "batch_liquidated":
    case "fee_shortfall":
      return ALCHEMIX_LINE_WIDE;
    case "transfer":
      return ALCHEMIX_CUSTODY;
    default:
      return ALCHEMIX_OPEN_DEPOSIT;
  }
}

/** The mechanic a whole transaction is about. A custody leg rides along with
 *  an opening and with a hand-over that moved an axis in the same transaction;
 *  what the reader needs explained there is the axis, so the leg that moved one
 *  chooses the modal and a transaction of transfers alone keeps custody. */
export function alchemixLearnMoreFor(legs: AlchemistEvent[]): LearnMoreContent {
  const lead =
    legs.find((l) => l.context.data.eventType === "self_liquidated") ??
    legs.find((l) => l.context.data.eventType !== "transfer") ??
    legs[0];
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
  redemptionNet: RedemptionNet | null;
  underlyingSymbol: string | null;
  /** The reading before this card's block, which a close's returned
   *  collateral is measured from. */
  readingBefore?: AlchemixReading | null;
}

/** The trailing gas bullet, Liquity's: the holder's own transactions only. A
 *  line row is the Transmuter's transaction, and its gas is nobody's here. */
function gasClause(legs: AlchemistEvent[]): ClauseInput {
  if (legs.some((l) => l.context.data.scope === "line")) return null;
  const gas = legs.find((l) => l.gas && l.gas.gasCostEth > 0)?.gas;
  if (!gas) return null;
  return clause(<>Gas for this transaction: {formatGasCost(gas)}.</>);
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
        redemptionNet: prose.redemptionNet,
        underlyingSymbol: prose.underlyingSymbol,
        readingBefore: prose.readingBefore ?? null,
      }),
    ),
    ...(roundTrip ? [alchemixCustodyRoundTripClause(roundTrip)] : []),
    ...readingClauses,
    gasClause(legs),
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
