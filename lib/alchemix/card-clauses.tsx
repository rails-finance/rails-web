// The Alchemist card's bullets, teaser included, composed from its legs
// (lib/alchemix/explainer-clauses.tsx): the card's pane
// (components/protocol/alchemix/alchemix-event-explainer.tsx) and, on the
// server, the event page's title, the teaser's first sentence (rails-ops
// decision 0045).

import type { RedemptionNet } from "@/lib/alchemix/redemption-net";
import type { AlchemixReading } from "@/lib/alchemix/readings-before";
import { splitLead, type ClauseInput } from "@/lib/shared/explainer-prose";
import {
  alchemixBetweenReadingsClauses,
  alchemixCustodyRoundTripClause,
  alchemixEventClauses,
  alchemixReadingClauses,
  custodyPathInTx,
  type AlchemistEvent,
} from "@/lib/alchemix/explainer-clauses";

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
  /** A line-scope row shares this card's block (`lineEventBlocks`). */
  lineEventInBlock?: boolean;
}

/** Every bullet the card can show, teaser included. */
export function alchemixCardClauses(
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
    ...alchemixBetweenReadingsClauses(
      legs,
      prose.readingBefore,
      { symbol: prose.underlyingSymbol, decimals: prose.underlyingDecimals },
      { protocolFeeBps: prose.protocolFeeBps, lineEventInBlock: prose.lineEventInBlock ?? false },
    ),
  ];
}

/** The teaser: the first bullet, rendered on the card face. */
export function alchemixExplainerTeaser(legs: AlchemistEvent[], siblings: AlchemistEvent[], prose: AlchemixCardProse) {
  return splitLead(alchemixCardClauses(legs, siblings, prose)).lead;
}
