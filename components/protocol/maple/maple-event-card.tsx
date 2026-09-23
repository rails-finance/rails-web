"use client";

// Composer: wires the Maple header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).

import type { BaseActivityEvent, MapleContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { flankedLegProv, sharesLegProv, type MapleCoords } from "@/lib/maple/event-provenance";
import { mapleExplainerTeaser } from "@/lib/maple/explainer-clauses";
import { MapleEventHeader } from "./maple-event-header";
import { MapleEventDetail } from "./maple-event-detail";
import { MapleEventExplainer, mapleLearnMoreContent } from "./maple-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface MapleEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "maple"; data: MapleContext } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

// direction "right" = token moves away from the wallet (deposit / escrow),
// "left" = toward the wallet (withdraw / fill / return). A transfer is neither —
// the pool token changed hands, nothing entered or left the pool — so it has
// no entry here: the row wears the paper-plane badge and no flank (see
// `tokens`).
const DIRECTION: Record<Exclude<MapleContext["eventType"], "transfer_in" | "transfer_out">, "right" | "left"> = {
  deposit: "right",
  withdraw: "left",
  request: "right",
  request_decrease: "left",
  request_cancel: "left",
  request_fill: "left",
};

export function MapleEventCard({ event, isFirst, isLast, eventNumber }: MapleEventCardProps) {
  const ctx = event.context.data;
  const kind = ctx.eventType;
  const isTransfer = kind === "transfer_in" || kind === "transfer_out";
  const isAssetEvent = ctx.eventType === "deposit" || ctx.eventType === "withdraw" || ctx.eventType === "request_fill";
  const symbol = isAssetEvent ? ctx.assetSymbol : ctx.poolSymbol;
  // Third-party action: the owner neither signed the tx nor was the event's
  // own caller (a deposit made on behalf, a queue bot fill is NOT external —
  // fills carry no caller and are the queue working as designed).
  const extBy =
    ctx.eventType === "request_fill"
      ? null
      : externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

  // The spine value IS the header's flanked leg — same builder + signed-value
  // convention (flankedLegProv negates `request`), so the echo's receipt key
  // matches byte-for-byte regardless of the card's own direction convention.
  const coords: MapleCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    pool: ctx.pool,
    account: event.wallet,
  };
  const flanked = flankedLegProv(ctx, coords);
  const mag = flanked ? Math.abs(flanked.value) : 0;
  // The share leg the header also registers on a deposit / withdraw. It gets
  // its own spine row rather than being dropped: the header hands its values
  // off to the spine at ≥sm, so a registered delta with no row to land on was
  // simply disappearing at desktop width. Its direction is the mint/burn
  // mirror of the asset leg — pool tokens come back when assets go in.
  const shares = sharesLegProv(ctx, coords);
  // Both legs name their contract as well as their symbol, read from the flows
  // this event already carries: the asset leg is the pool's underlying, the
  // share leg the pool token itself, and Maple's timeline records each with the
  // address it moved. That address is the only handle the icon chip has on a
  // CDN — a pool share symbol was never going to appear in the house table, so
  // without it those rows fall through to a letter. Matching by symbol keeps
  // the two legs apart, and a symbol on both would resolve to neither.
  //
  // A transfer is a custody move: the token's icon wears the paper-plane badge
  // and neither flank is drawn — the two flanks are "out to the wallet" and
  // "into the protocol", and a transfer to another account is neither. The
  // header states the amount and the to/from counterparty.
  const tokens =
    mag === 0 || !flanked
      ? undefined
      : isTransfer
        ? [{ symbol, address: soleFlowAddress(event.flows, symbol), badge: "send" as const }]
        : [
            {
              symbol,
              address: soleFlowAddress(event.flows, symbol),
              direction: DIRECTION[kind],
              value: mag,
              prov: {
                info: flanked.prov,
                value: chainTruthDeltaValue(flanked.value, false),
                symbol: flanked.symbol,
              },
            },
            ...(shares
              ? [
                  {
                    symbol: shares.symbol,
                    address: soleFlowAddress(event.flows, shares.symbol),
                    direction: (shares.value < 0 ? "right" : "left") as "left" | "right",
                    value: Math.abs(shares.value),
                    prov: {
                      info: shares.prov,
                      value: chainTruthDeltaValue(shares.value, false),
                      symbol: shares.symbol,
                    },
                  },
                ]
              : []),
          ];

  const iconSlot = (
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
        <MapleEventHeader
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
        <MapleEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} wallet={event.wallet} />
      }
      detailLabel="Position state"
      explainer={
        <MapleEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={mapleExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={mapleLearnMoreContent(ctx)} />}
      persistKey={`maple:${event.id}`}
    />
  );
}
