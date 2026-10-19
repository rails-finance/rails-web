// An Alchemix card's kind, without the row: the words T1 states (decision 0045,
// lib/alchemix/head-words.ts). The Alchemist's header
// (components/protocol/alchemix/alchemix-event-header.tsx) and the Transmuter's
// (transmuter-event-card.tsx) read their labels here, and so does the server,
// for the event page's title where the card has no teaser.

import { openingInTx, type AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { splitRidingTransfers, withRiders } from "@/lib/alchemix/riding-transfers";
import {
  ALCHEMIX_AXIS_KINDS,
  ALCHEMIX_HEAD_WORDS,
  alchemixLegKind,
  alchemixV2Kind,
  transmuterKind,
} from "@/lib/alchemix/head-words";
import {
  isAlchemistEvent,
  isAlchemixV2Event,
  isTransmuterEvent,
  type BaseActivityEvent,
} from "@/lib/shared/types/event-shape";

const ON_SPINE = new Set(["force_repay", "redemption", "batch_liquidated", "fee_shortfall"]);

/** One leg's kind, and whether it is the bare custody row. */
function legLabel(leg: AlchemistEvent, siblings: AlchemistEvent[]): { label: string; custody?: boolean } {
  const ctx = leg.context.data;
  if (ctx.eventType === "transfer") {
    const forwarding = openingInTx(siblings, ctx.tokenId)?.forwardingMoves.includes(leg) ?? false;
    const t = ctx.transfer?.transferType;
    return { label: alchemixLegKind(ctx, { forwarding }), custody: t !== "mint" && !forwarding };
  }
  return { label: alchemixLegKind(ctx) };
}

/** The kind of the card drawn from these legs (decision 0045): the header's
 *  label and, on the server, the page title where the card has no teaser. */
export function alchemixLegsLabel(legs: AlchemistEvent[], siblings: AlchemistEvent[]): string {
  const lead = legs[0];
  const specs = legs.map((l) => legLabel(l, siblings));
  if (legs.length === 1) return specs[0].label;
  const tokenId = legs.find((l) => l.context.data.tokenId != null)?.context.data.tokenId ?? null;
  const at = (type: string) => legs.findIndex((l) => l.context.data.eventType === type);
  let label = "";
  if (at("liquidated") >= 0) label = specs[at("liquidated")].label;
  else if (at("self_liquidated") >= 0) label = ALCHEMIX_HEAD_WORDS.closedWithCollateral;
  else if (legs.some((l) => ON_SPINE.has(l.context.data.eventType)))
    label = specs[legs.findIndex((l) => ON_SPINE.has(l.context.data.eventType))].label;
  else if (openingInTx(siblings, tokenId) && legs.some((l) => l.context.data.transfer?.transferType === "mint"))
    label = ALCHEMIX_HEAD_WORDS.opened;
  else if (specs.every((s) => s.custody)) label = specs[specs.length - 1].label;
  if (label === "") {
    // A transaction of moves that is not an opening (a top-up that deposits
    // and mints, a withdrawal through the router) reads as its legs.
    const axisLegs = legs.filter((l) => l.context.data.eventType !== "transfer");
    if (axisLegs.length > 0 && axisLegs.every((l) => ALCHEMIX_AXIS_KINDS.has(l.context.data.eventType)))
      label = [...new Set(axisLegs.map((l) => alchemixLegKind(l.context.data)))].join(` ${ALCHEMIX_HEAD_WORDS.sep} `);
  }
  return label || alchemixLegKind(lead.context.data);
}

/** A Transmuter card's kind. */
export function transmuterLegsLabel(legs: AlchemistEvent[]): string {
  return transmuterKind(legs);
}

/** The heading of the event page for `event`, read from the position's served
 *  rows as the timeline draws them: the transfers riding on its transaction
 *  join its card, and the transaction's legs are its siblings. */
export function alchemixEventHeading(event: BaseActivityEvent, rows: readonly BaseActivityEvent[]): string {
  if (isTransmuterEvent(event)) {
    const transmuter = rows.filter(isTransmuterEvent);
    const { ridersByTx } = splitRidingTransfers(transmuter, () => true);
    return transmuterLegsLabel(withRiders([event], ridersByTx));
  }
  if (isAlchemixV2Event(event)) return alchemixV2Kind(event.context.data);
  if (!isAlchemistEvent(event)) return event.actionLabel;
  const alchemist = rows.filter(isAlchemistEvent);
  const { ridersByTx } = splitRidingTransfers(alchemist, (e) => e.context.data.scope === "position");
  const siblings = alchemist.filter((e) => e.txHash === event.txHash);
  return alchemixLegsLabel(withRiders([event], ridersByTx), siblings.length > 0 ? siblings : [event]);
}
