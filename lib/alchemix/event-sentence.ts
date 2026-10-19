// The event page's browser title for the three Alchemix timelines: the
// Explanation's first sentence, as the page's h1 states it (rails-ops decision
// 0045, "Ruled since"), else the head's words (lib/alchemix/event-label.ts).
// Server-safe: the sentences are composed in lib (card-clauses.tsx,
// transmuter-lines.ts, v2-lines.ts). A reading the card takes in the browser
// (the reading before a close, a redemption's net) is not in hand here, so the
// sentence is the one the card states before those land.

import {
  isAlchemistEvent,
  isAlchemixV2Event,
  isTransmuterEvent,
  type BaseActivityEvent,
} from "@/lib/shared/types/event-shape";
import { splitRidingTransfers, withRiders } from "@/lib/alchemix/riding-transfers";
import { alchemixExplainerTeaser } from "@/lib/alchemix/card-clauses";
import { transmuterExplainerLines, type TransmuterEvent } from "@/lib/alchemix/transmuter-lines";
import { movedAmount, v2Sentence, type AlchemixV2Event } from "@/lib/alchemix/v2-lines";
import type { TransmuterEarlyClaim } from "@/lib/alchemix/transmuter-early-claim";
import { lineProtocolFeeBps } from "@/lib/alchemix/lines";
import { firstSentenceText } from "@/lib/alchemix/sentence-text";
import { alchemixEventHeading } from "@/lib/alchemix/event-label";

/** What the page knows beyond the rows: the line's share ticker and its
 *  underlying's decimals (the Alchemist), the claim's split (the Transmuter). */
export interface AlchemixSentencePage {
  mytSymbol?: string | null;
  underlyingDecimals?: number | null;
  early?: TransmuterEarlyClaim | null;
}

export function alchemixEventSentence(
  event: BaseActivityEvent,
  rows: readonly BaseActivityEvent[],
  page: AlchemixSentencePage = {},
): string {
  const words = alchemixEventHeading(event, rows);
  if (isAlchemixV2Event(event)) {
    const e = event as AlchemixV2Event;
    return firstSentenceText(v2Sentence(e, movedAmount(e.context.data))) ?? words;
  }
  if (isTransmuterEvent(event)) {
    const transmuter = rows.filter(isTransmuterEvent);
    const { ridersByTx } = splitRidingTransfers(transmuter, () => true);
    const legs = withRiders([event], ridersByTx) as TransmuterEvent[];
    const claim = legs.some((l) => l.context.data.eventType === "transmuter_position_claimed");
    const lines = transmuterExplainerLines(legs, page.mytSymbol ?? "vault shares", claim ? (page.early ?? null) : null);
    return firstSentenceText(lines[0]) ?? words;
  }
  if (!isAlchemistEvent(event)) return words;
  const alchemist = rows.filter(isAlchemistEvent);
  const { ridersByTx } = splitRidingTransfers(alchemist, (e) => e.context.data.scope === "position");
  const legs = withRiders([event], ridersByTx);
  const siblings = alchemist.filter((e) => e.txHash === event.txHash);
  const ctx = event.context.data;
  const teaser = alchemixExplainerTeaser(legs, siblings.length > 0 ? siblings : [event], {
    underlyingDecimals: page.underlyingDecimals ?? null,
    mytSymbol: page.mytSymbol ?? "shares",
    protocolFeeBps: lineProtocolFeeBps(ctx.chainId, ctx.lineKey),
    collateralTakenRaw: null,
    redemptionNet: null,
    underlyingSymbol: null,
  });
  return firstSentenceText(teaser) ?? words;
}
