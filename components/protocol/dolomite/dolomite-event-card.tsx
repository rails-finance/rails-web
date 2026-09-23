"use client";

// Composer: wires the Dolomite header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).
//
// The rows arrive at the BALANCE grain — one row per BalanceUpdate leg, so a
// liquidation is FOUR rows across two accounts and this account's timeline
// shows its own two. The borrower-side legs (`liquidation`, `seize_out`) are
// critical-toned on the spine and never render a token-flow chip that reads
// like a send — a seizure is not something the borrower did. The
// liquidator-side legs (`seize_in`, `liquidation_payout`) are that account's
// own acts and flow normally.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { movedDeltaProv, type DolomiteCoords } from "@/lib/dolomite/event-provenance";
import { dolomiteExplainerTeaser, type DolomiteEvent } from "@/lib/dolomite/explainer-clauses";
import { DolomiteEventHeader } from "./dolomite-event-header";
import { DolomiteEventDetail } from "./dolomite-event-detail";
import { DolomiteEventExplainer, dolomiteLearnMoreContent } from "./dolomite-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface DolomiteEventCardProps {
  event: DolomiteEvent;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling legs — the liquidation seam (defaults to just this one). */
  siblings?: DolomiteEvent[];
  /** The page's uint256 account number (decimal STRING). */
  accountNumber?: string;
}

export function DolomiteEventCard({
  event,
  isFirst,
  isLast,
  eventNumber,
  siblings,
  accountNumber,
}: DolomiteEventCardProps) {
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
  // The spine value IS the header's registered delta (this account carries
  // only one leg per row) — echo it via the SAME selector + coords the header
  // builds from, so the receipt key matches byte-for-byte.
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
            prov: {
              info: movedDeltaProv(ctx.eventType, ctx.marketSymbol, coords, ctx.raw?.weiDelta),
              value: chainTruthDeltaValue(d, false),
              symbol: ctx.marketSymbol,
            },
          },
        ];

  const iconSlot = isBorrowerLoss ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel={ctx.eventType === "liquidation" ? "Liquidation" : "Seizure"}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn
      tokens={tokens}
      externalParty={!!extBy}
      spine={extBy ? "dotted" : "solid"}
      isFirst={isFirst}
      isLast={!!isLast}
    />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <DolomiteEventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          externalBy={extBy ?? undefined}
          wallet={event.wallet}
          flows={event.flows}
        />
      }
      detail={
        <DolomiteEventDetail
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          event={event}
          siblings={sibs}
          accountNumber={accountNumber}
        />
      }
      detailLabel="Position state"
      explainer={
        <DolomiteEventExplainer
          ctx={ctx}
          event={event}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          siblings={sibs}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={dolomiteExplainerTeaser(ctx, coords, sibs, event)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={dolomiteLearnMoreContent(ctx)} />}
      persistKey={`dolomite:${event.id}`}
    />
  );
}
