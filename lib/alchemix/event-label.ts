// An Alchemix card's row label, without the row: the words T1 states, for the
// event page's heading and the route's metadata. The Alchemist's come from
// `alchemixHeaderSpec` (components/protocol/alchemix/alchemix-event-header.tsx),
// the Transmuter's from `rowSpec` (transmuter-event-card.tsx). Both are client
// modules, so the server reads the label here. They must agree: a label
// decision changed in a header is changed here in the same commit.

import { openingInTx, type AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { splitRidingTransfers, withRiders } from "@/lib/alchemix/riding-transfers";
import { isAlchemistEvent, isTransmuterEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";

const SELF_LIQUIDATION_LABEL = "Closed with collateral";
const AXIS_VERB: Record<string, string> = { deposit: "Deposit", withdraw: "Withdraw", mint: "Mint", burn: "Burn" };
const ON_SPINE = new Set(["force_repay", "redemption", "batch_liquidated", "fee_shortfall"]);

/** One leg's label, and whether it is the bare custody row. */
function legLabel(leg: AlchemistEvent, siblings: AlchemistEvent[]): { label: string; custody?: boolean } {
  const ctx = leg.context.data;
  if (ctx.eventType === "self_liquidated") return { label: SELF_LIQUIDATION_LABEL };
  if (ctx.eventType === "transfer") {
    if (ctx.transfer?.transferType === "mint") return { label: "Mint position" };
    if (openingInTx(siblings, ctx.tokenId)?.forwardingMoves.includes(leg)) return { label: "Forward position" };
    return { label: leg.actionLabel, custody: true };
  }
  return { label: leg.actionLabel };
}

/** The label of the card drawn from these legs. */
export function alchemixLegsLabel(legs: AlchemistEvent[], siblings: AlchemistEvent[]): string {
  const lead = legs[0];
  const specs = legs.map((l) => legLabel(l, siblings));
  if (legs.length === 1) return specs[0].label;
  const tokenId = legs.find((l) => l.context.data.tokenId != null)?.context.data.tokenId ?? null;
  const at = (type: string) => legs.findIndex((l) => l.context.data.eventType === type);
  let label = "";
  if (at("liquidated") >= 0) label = specs[at("liquidated")].label;
  else if (at("self_liquidated") >= 0) label = SELF_LIQUIDATION_LABEL;
  else if (legs.some((l) => ON_SPINE.has(l.context.data.eventType)))
    label = specs[legs.findIndex((l) => ON_SPINE.has(l.context.data.eventType))].label;
  else if (openingInTx(siblings, tokenId) && legs.some((l) => l.context.data.transfer?.transferType === "mint"))
    label = "Open";
  else if (specs.every((s) => s.custody)) label = specs[0].label;
  if (label === "") {
    const axisLegs = legs.filter((l) => l.context.data.eventType !== "transfer");
    if (axisLegs.length > 0 && axisLegs.every((l) => AXIS_VERB[l.context.data.eventType] != null))
      label =
        axisLegs.length === 1
          ? axisLegs[0].actionLabel
          : [...new Set(axisLegs.map((l) => AXIS_VERB[l.context.data.eventType]))].join(" · ");
  }
  return label || lead.actionLabel;
}

/** A Transmuter card's label: the stake opens, the claim claims, a poke keeps
 *  its log's word, and custody alone takes the last transfer's. */
export function transmuterLegsLabel(legs: AlchemistEvent[]): string {
  const of = (type: string) => legs.find((l) => l.context.data.eventType === type);
  if (of("transmuter_position_created")) return "Open";
  if (of("transmuter_position_claimed")) return "Claim";
  const poked = of("transmuter_position_poked");
  if (poked) return poked.actionLabel;
  const transfers = legs.filter((l) => l.context.data.eventType === "transfer");
  return transfers[transfers.length - 1]?.actionLabel ?? "Transfer";
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
  if (!isAlchemistEvent(event)) return event.actionLabel;
  const alchemist = rows.filter(isAlchemistEvent);
  const { ridersByTx } = splitRidingTransfers(alchemist, (e) => e.context.data.scope === "position");
  const siblings = alchemist.filter((e) => e.txHash === event.txHash);
  return alchemixLegsLabel(withRiders([event], ridersByTx), siblings.length > 0 ? siblings : [event]);
}
