"use client";

// Composer: fills the shared event card's slots (components/shared/
// event-card.tsx; ui-jobs 309) from a Compound V2 event: the head, the
// balance sheet (ui-jobs 330; compound-v2-event-sheet.tsx) where the page
// replays the account, else the account's Collateral and Debt ledger cells
// with the market's cells after them, the forensics and the Comptroller's
// lines as notes, the price row and the explanation.
//
// Two shapes Moonwell's composer never met:
//   • liquidation — ONE card per liquidation (the index merged its repay leg),
//     critical-toned on the spine.
//   • the named seizure legs — seize_out / seize_burn are collateral being
//     TAKEN from this wallet (warning icon, never a token-flow chip that reads
//     like a send); seize_in is the liquidator's receipt (a real inflow).

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps, SpineWarningLeg } from "@/components/shared/spine-column";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { useContext } from "react";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { COMPOUND_V2_HEAD_WORDS } from "@/lib/compound-v2/event-templates";

import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { compoundV2EventProse, type CompoundV2Event } from "@/lib/compound-v2/event-prose";
import { compoundV2HeadSpec, compoundV2T1Caption } from "./compound-v2-event-header";
import { useCompoundV2Cells } from "./compound-v2-event-detail";
import { useCompoundV2Sheet } from "./compound-v2-event-sheet";
import {
  CompoundV2EventExplainer,
  CompoundV2ExplainerTeaser,
  compoundV2EchoCoords,
  compoundV2EchoFor,
  isGroupedExplanation,
} from "./compound-v2-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { ownerPaidGas } from "@/components/shared/event-price-row";

export interface CompoundV2EventCardProps {
  event: CompoundV2Event;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the seize seam (defaults to just this one). */
  siblings?: CompoundV2Event[];
}

// direction "right" = token moves away from the wallet (deposit / repay),
// "left" = toward the wallet (withdraw / borrow). The seize legs never reach
// this map — they render on the warning spine, not as flows. Nor do the
// transfers: a cToken changing hands is a custody move, neither flank, and
// the row wears the paper-plane badge instead (see `tokens`).
const DIRECTION: Partial<Record<CompoundV2Context["eventType"], "right" | "left">> = {
  mint: "right",
  redeem: "left",
  borrow: "left",
  repay: "right",
  liquidation: "left",
  seize_in: "left",
};

export function CompoundV2EventCard({ event, isLast, eventNumber, siblings }: CompoundV2EventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const isLiq = ctx.eventType === "liquidation";
  // The borrower's side of a seizure: collateral being taken (or burned as the
  // protocol's cut) — a passive loss, like the liquidation row itself.
  const isSeizeLoss = ctx.eventType === "seize_out" || ctx.eventType === "seize_burn";
  const isCTokenMove =
    ctx.eventType === "transfer_in" ||
    ctx.eventType === "transfer_out" ||
    ctx.eventType === "seize_in" ||
    ctx.eventType === "seize_out" ||
    ctx.eventType === "seize_burn";
  // cToken-lane events move cTokens (no emitted underlying amount); everything
  // else moves the underlying.
  const d = Number((isCTokenMove ? ctx.cTokensDelta : ctx.assetsDelta) ?? "0") || 0;
  const mag = Math.abs(d);
  const cSymbol = event.flows[0]?.tokenSymbol ?? `c${ctx.marketSymbol}`;
  const symbol = isCTokenMove ? cSymbol : ctx.marketSymbol;
  // Third-party action: the owner neither signed the tx nor was the event's
  // own party. Seize legs and liquidations carry their own critical treatment
  // instead of the external glyph.
  const extBy =
    isLiq || isSeizeLoss || ctx.eventType === "seize_in"
      ? null
      : externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

  const dir = DIRECTION[ctx.eventType];
  const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
  const coords = compoundV2EchoCoords(ctx, event);
  const prose = compoundV2EventProse({
    ctx,
    siblings: sibs,
    self: event,
    externalBy: extBy ?? undefined,
    blockNumber: event.blockNumber,
  });
  // The address goes to the icon chip, which can only ask a CDN about a
  // contract; the symbol alone sends it to the house table. It is looked up
  // under the DISPLAYED `symbol`, because the address has to identify the same
  // asset the mark is being drawn for (cSAI/cWBTC2 on the cToken lane). A mint
  // moves the underlying and the cToken in one transaction, so both symbols
  // appear in the flows; matching by symbol picks out the right one, and a
  // symbol carried by two flows is left unresolved rather than guessed at.
  //
  // A transfer is a custody move: the token's icon wears the paper-plane
  // badge, its amount on the flank the position's balance moved by, out to the
  // left or in to the right; the head's clause names the counterparty.
  const tokens =
    isLiq || isSeizeLoss || mag === 0
      ? undefined
      : isTransfer
        ? [
            {
              symbol,
              address: soleFlowAddress(event.flows, symbol),
              badge: "send" as const,
              direction: ctx.eventType === "transfer_out" ? ("left" as const) : ("right" as const),
              value: mag,
              unit: symbol,
              fullValue: true,
              verb:
                ctx.eventType === "transfer_out" ? COMPOUND_V2_HEAD_WORDS.legSent : COMPOUND_V2_HEAD_WORDS.legReceived,
            },
          ]
        : !dir
          ? undefined
          : [
              {
                symbol,
                address: soleFlowAddress(event.flows, symbol),
                direction: dir,
                value: mag,
              },
            ];

  // The warning node's flank carries what the head stated before decision
  // 0045: a liquidation's legs, the collateral seized below the debt repaid,
  // and a seizure leg's cTokens.
  const warningLegs = ((): SpineWarningLeg[] | undefined => {
    if (isSeizeLoss)
      return mag !== 0
        ? [
            {
              label: COMPOUND_V2_HEAD_WORDS.legSeized,
              value: mag,
              symbol: cSymbol,
              address: soleFlowAddress(event.flows, cSymbol),
            },
          ]
        : undefined;
    if (!isLiq) return undefined;
    const legs: SpineWarningLeg[] = [];
    const seized = Math.abs(Number(ctx.seizeTokens ?? "0")) || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
      const collCSym = collM?.cSymbol ?? `c${ctx.collateralSymbol}`;
      legs.push({
        label: COMPOUND_V2_HEAD_WORDS.legSeized,
        value: seized,
        symbol: collCSym,
        address: soleFlowAddress(event.flows, collCSym),
      });
    }
    const repaid = Math.abs(Number(ctx.assetsDelta ?? "0")) || 0;
    if (repaid !== 0)
      legs.push({
        label: COMPOUND_V2_HEAD_WORDS.legRepaid,
        value: repaid,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(event.flows, ctx.marketSymbol),
      });
    return legs;
  })();

  const spine: SpineColumnProps =
    isLiq || isSeizeLoss
      ? { icon: "warning", warningTone: "critical", warningLegs, isLast: !!isLast }
      : { tokens, externalParty: !!extBy, isLast: !!isLast };

  const { cells, ledgers, notes, prices } = useCompoundV2Cells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    eventId: event.id,
    eventTs: event.timestamp,
  });

  const sheet = useCompoundV2Sheet({
    ctx,
    eventId: event.id,
    label: event.actionLabel,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
  });

  // The timeline's head is words (decision 0045); the event page's card keeps
  // the head its title states.
  const page = useContext(EventPageContext) != null;
  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "compound-v2",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head: compoundV2HeadSpec({
      mode: page ? "title" : "row",
      actionLabel: event.actionLabel,
      ctx,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      externalBy: extBy ?? undefined,
      wallet: event.wallet,
      flows: event.flows,
    }),
    caption: page ? event.actionLabel : compoundV2T1Caption(ctx, event.actionLabel),
    actor: {
      by: extBy ?? (isLiq ? ctx.liquidator : undefined) ?? undefined,
      // A transfer received: the sender acted; any other kind follows the
      // transaction-sender test (ui-jobs 304).
      byOwner: ctx.eventType === "transfer_in" ? false : undefined,
      sent: { txFrom: ctx.txFrom, caller: ctx.caller, owner: event.wallet },
    },
    cells,
    sheet,
    ledgers,
    notes,
    price: { gas: ownerPaidGas(event, ctx.txFrom), prices },
    explainer: {
      body: <CompoundV2EventExplainer ctx={ctx} event={event} externalBy={extBy ?? undefined} siblings={sibs} />,
      first:
        prose.L4.length > 0 ? (
          <CompoundV2ExplainerTeaser prose={prose} echo={(key) => compoundV2EchoFor(key, ctx, coords)} />
        ) : undefined,
      grouped: isGroupedExplanation(prose),
    },
    learnMore: <LearnMore inline content={prose.L5.content} />,
  };

  return <EventCard slots={slots} avatar={null} />;
}
