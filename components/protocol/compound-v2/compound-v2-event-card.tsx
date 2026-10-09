"use client";

// Composer: fills the shared event card's slots (components/shared/
// event-card.tsx; ui-jobs 309) from a Compound V2 event: the head, the
// account's Collateral and Debt ledger cells with the market's cells after
// them, the forensics and the Comptroller's lines as notes, the price row and
// the explanation.
//
// Two shapes Moonwell's composer never met:
//   • liquidation — ONE card per liquidation (the index merged its repay leg),
//     critical-toned on the spine.
//   • the named seizure legs — seize_out / seize_burn are collateral being
//     TAKEN from this wallet (warning icon, never a token-flow chip that reads
//     like a send); seize_in is the liquidator's receipt (a real inflow).

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps } from "@/components/shared/spine-column";

import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type CompoundV2Coords } from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2ExplainerTeaser, type CompoundV2Event } from "@/lib/compound-v2/explainer-clauses";
import { compoundV2HeadSpec } from "./compound-v2-event-header";
import { useCompoundV2Cells } from "./compound-v2-event-detail";
import { CompoundV2EventExplainer, compoundV2LearnMoreContent } from "./compound-v2-event-explainer";
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
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const catalogCSym = market?.cSymbol ?? `c${ctx.marketSymbol}`;
  const coords: CompoundV2Coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    ctoken: market?.ctoken,
    marketLabel: catalogCSym,
    account: event.wallet,
  };
  // The address goes to the icon chip, which can only ask a CDN about a
  // contract; the symbol alone sends it to the house table. It is looked up
  // under the DISPLAYED `symbol`, because the address has to identify the same
  // asset the mark is being drawn for (cSAI/cWBTC2 on the cToken lane). A mint
  // moves the underlying and the cToken in one transaction, so both symbols
  // appear in the flows; matching by symbol picks out the right one, and a
  // symbol carried by two flows is left unresolved rather than guessed at.
  //
  // A transfer is a custody move: the token's icon wears the paper-plane badge
  // and neither flank is drawn — the two flanks are "out to the wallet" and
  // "into the protocol", and a transfer to another account is neither. The
  // header states the amount and the to/from counterparty.
  const tokens =
    isLiq || isSeizeLoss || mag === 0
      ? undefined
      : isTransfer
        ? [{ symbol, address: soleFlowAddress(event.flows, symbol), badge: "send" as const }]
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

  const spine: SpineColumnProps =
    isLiq || isSeizeLoss
      ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
      : { tokens, externalParty: !!extBy, isLast: !!isLast };

  const { cells, ledgers, notes, prices } = useCompoundV2Cells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    eventId: event.id,
    eventTs: event.timestamp,
  });

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
      actionLabel: event.actionLabel,
      ctx,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      externalBy: extBy ?? undefined,
      wallet: event.wallet,
      flows: event.flows,
    }),
    caption: event.actionLabel,
    actor: {
      by: extBy ?? (isLiq ? ctx.liquidator : undefined) ?? undefined,
      custody:
        ctx.counterparty && isTransfer
          ? { dir: ctx.eventType === "transfer_out" ? "to" : "from", address: ctx.counterparty }
          : undefined,
    },
    cells,
    ledgers,
    notes,
    price: { gas: ownerPaidGas(event, ctx.txFrom), prices },
    explainer: {
      body: (
        <CompoundV2EventExplainer ctx={ctx} event={event} externalBy={extBy ?? undefined} siblings={sibs} skipLead />
      ),
      first: compoundV2ExplainerTeaser(ctx, coords, sibs, event, extBy ?? undefined) ?? undefined,
    },
    learnMore: <LearnMore inline content={compoundV2LearnMoreContent(ctx)} />,
  };

  return <EventCard slots={slots} avatar={null} />;
}
