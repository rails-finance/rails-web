"use client";

// Composer: fills the shared event card's slots (components/shared/
// event-card.tsx; ui-jobs 309) from a Dolomite balance leg: the head, the
// account's Collateral and Debt ledger cells with the market's balance cell
// after them, the other account, forensics and spread lines as notes, the
// price row and the explanation.
//
// The rows arrive at the BALANCE grain — one row per BalanceUpdate leg, so a
// liquidation is FOUR rows across two accounts and this account's timeline
// shows its own two. The borrower-side legs (`liquidation`, `seize_out`) are
// critical-toned on the spine and never render a token-flow chip that reads
// like a send — a seizure is not something the borrower did. The
// liquidator-side legs (`seize_in`, `liquidation_payout`) are that account's
// own acts and flow normally.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { ownerPaidGas } from "@/components/shared/event-price-row";

import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type DolomiteCoords } from "@/lib/dolomite/event-provenance";
import { dolomiteExplainerTeaser, type DolomiteEvent } from "@/lib/dolomite/explainer-clauses";
import { dolomiteHeadSpec } from "./dolomite-event-header";
import { useDolomiteCells } from "./dolomite-event-detail";
import { DolomiteEventExplainer, dolomiteLearnMoreContent } from "./dolomite-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface DolomiteEventCardProps {
  event: DolomiteEvent;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling legs — the liquidation seam (defaults to just this one). */
  siblings?: DolomiteEvent[];
  /** The page's uint256 account number (decimal STRING). */
  accountNumber?: string;
}

export function DolomiteEventCard({ event, isLast, eventNumber, siblings, accountNumber }: DolomiteEventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  // The borrower's side of a liquidation: debt written down / collateral
  // taken — a passive loss, warning-toned, no flow chip.
  const isBorrowerLoss = ctx.eventType === "liquidation" || ctx.eventType === "seize_out";
  const d = Number(ctx.weiDelta ?? "0") || 0;
  const mag = Math.abs(d);
  // Third-party action: the owner neither signed the tx nor was the event's
  // own party. Liquidation legs carry their own critical treatment instead.
  const extBy =
    isBorrowerLoss || ctx.eventType === "seize_in" || ctx.eventType === "liquidation_payout"
      ? null
      : externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

  // direction "right" = tokens moving away from the account, "left" = toward it.
  const dir = d > 0 ? ("left" as const) : ("right" as const);
  const coords: DolomiteCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    owner: event.wallet,
    marketId: ctx.marketId,
  };
  // Dolomite's markets are registered by the protocol and its listed set is
  // wide and still growing, so the symbol a row shows is quite often one the
  // house address table has never been told about — and without an address the
  // icon chip never reaches a CDN at all. The market's own token address is in
  // the event's flows, and it is exact: it is the contract the transfer moved.
  // Two flows under one symbol resolve to nothing, since a mark on the wrong
  // contract claims more than a letter does.
  const tokens =
    isBorrowerLoss || mag === 0
      ? undefined
      : [
          {
            symbol: ctx.marketSymbol,
            address: soleFlowAddress(event.flows, ctx.marketSymbol),
            direction: dir,
            value: mag,
          },
        ];

  const spine: SpineColumnProps = isBorrowerLoss
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : { tokens, externalParty: !!extBy, isLast: !!isLast };

  const { cells, ledgers, notes, prices } = useDolomiteCells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    event,
    siblings: sibs,
    accountNumber,
  });

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "dolomite",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head: dolomiteHeadSpec({
      actionLabel: event.actionLabel,
      ctx,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      externalBy: extBy ?? undefined,
      wallet: event.wallet,
      flows: event.flows,
    }),
    caption: event.actionLabel,
    actor: { by: extBy ?? undefined },
    cells,
    ledgers,
    notes,
    price: { gas: ownerPaidGas(event, ctx.txFrom), prices },
    explainer: {
      body: (
        <DolomiteEventExplainer
          ctx={ctx}
          event={event}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          siblings={sibs}
          skipLead
        />
      ),
      first: dolomiteExplainerTeaser(ctx, coords, sibs, event) ?? undefined,
    },
    learnMore: <LearnMore inline content={dolomiteLearnMoreContent(ctx)} />,
  };

  return <EventCard slots={slots} avatar={null} />;
}
