"use client";

// Composer: wires the Fluid header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).

import type { FluidContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { colDeltaProv, debtDeltaProv, type FluidCoords } from "@/lib/fluid/event-provenance";
import { pairLabel } from "@/lib/fluid/asset-catalog";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { fluidExplainerTeaser, type FluidEvent } from "@/lib/fluid/explainer-clauses";
import { FluidEventHeader } from "./fluid-event-header";
import { FluidEventDetail } from "./fluid-event-detail";
import { FluidEventExplainer, fluidLearnMoreContent } from "./fluid-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface FluidEventCardProps {
  event: FluidEvent;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the split-open seam (defaults to just this one). */
  siblings?: FluidEvent[];
}

// direction "right" = token moves away from the wallet (deposit / repay),
// "left" = toward the wallet (withdraw / borrow). Composites derive each leg's
// direction from its own delta sign; this map carries the single-leg kinds.
const DIRECTION: Record<FluidContext["eventType"], "right" | "left"> = {
  deposit: "right",
  withdraw: "left",
  borrow: "left",
  payback: "right",
  deposit_borrow: "right",
  withdraw_payback: "left",
  deposit_payback: "right",
  withdraw_borrow: "left",
  liquidated: "left",
  absorbed: "left",
  mint: "right",
  transfer: "right",
};

export function FluidEventCard({ event, isFirst, isLast, eventNumber, siblings }: FluidEventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const isLiq = ctx.eventType === "liquidated" || ctx.eventType === "absorbed";
  const isNftMove = ctx.eventType === "mint" || ctx.eventType === "transfer";
  const supplySym = ctx.supplySymbol ?? "DEX shares";
  const borrowSym = ctx.borrowSymbol ?? "DEX shares";
  const colD = Number(ctx.colDelta ?? "0") || 0;
  const debtD = Number(ctx.debtDelta ?? "0") || 0;
  // Third-party action: the owner AT this event neither signed the tx nor was
  // the operate's initiator (msg.sender plays the party-param role). NFT moves
  // and liquidations carry no initiator, so they never mark here.
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.initiator }, ctx.ownerAt ?? event.wallet);

  // Token chips: one per moved leg. A composite carries both, each leg signed
  // by its own delta; a single-leg kind uses its canonical direction. Each
  // flanking value echoes the header's delta receipt (same exact figure, same
  // provenance — the SpineValProv contract).
  const coords: FluidCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    vault: ctx.vault,
    pairLabel: pairLabel(ctx.supplySymbol, ctx.borrowSymbol),
    nftId: ctx.nftId,
    owner: ctx.ownerAt ?? event.wallet,
  };
  // Each leg also names its token's contract, read from the flows on this very
  // event, because the icon chip resolves a mark by address and falls back to a
  // letter when it has only a symbol it cannot place. The lookup is keyed on
  // ctx.supplySymbol / ctx.borrowSymbol rather than the display strings above:
  // a DEX-shares leg has no ERC-20 behind it at all, and asking the flows about
  // the placeholder would be asking about a token that does not exist. As
  // everywhere, only a single matching flow answers.
  const colRow = {
    symbol: supplySym,
    address: soleFlowAddress(event.flows, ctx.supplySymbol),
    value: Math.abs(colD),
    prov: {
      info: colDeltaProv(supplySym, coords, ctx.raw?.colAmt),
      value: chainTruthDeltaValue(colD, false),
      symbol: supplySym,
    },
  };
  const debtRow = {
    symbol: borrowSym,
    address: soleFlowAddress(event.flows, ctx.borrowSymbol),
    value: Math.abs(debtD),
    prov: {
      info: debtDeltaProv(borrowSym, coords, ctx.raw?.debtAmt),
      value: chainTruthDeltaValue(debtD, false),
      symbol: borrowSym,
    },
  };
  const tokens =
    isLiq || isNftMove
      ? undefined
      : colD !== 0 && debtD !== 0
        ? [
            { ...colRow, direction: (colD > 0 ? "right" : "left") as "right" | "left" },
            { ...debtRow, direction: (debtD > 0 ? "left" : "right") as "right" | "left" },
          ]
        : colD !== 0
          ? [{ ...colRow, direction: DIRECTION[ctx.eventType] }]
          : debtD !== 0
            ? [{ ...debtRow, direction: DIRECTION[ctx.eventType] }]
            : undefined;

  const iconSlot = isLiq ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel={ctx.eventType === "absorbed" ? "Absorbed" : "Liquidation"}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : ctx.eventType === "mint" ? (
    <SpineColumn icon="mint" spine="dotted" isFirst={isFirst} isLast={!!isLast} />
  ) : ctx.eventType === "transfer" ? (
    // An ownership handover is a people event with no token flow — the person
    // glyph with the join badge marks the new owner taking over.
    <SpineColumn icon="delegate" iconDirection="up" spine="dotted" isFirst={isFirst} isLast={!!isLast} />
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
        <FluidEventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          externalBy={extBy ?? undefined}
          wallet={ctx.ownerAt ?? event.wallet}
          flows={event.flows}
        />
      }
      detail={
        <FluidEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} wallet={event.wallet} />
      }
      detailLabel="Position state"
      explainer={
        <FluidEventExplainer
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
      explainerTeaser={fluidExplainerTeaser(ctx, coords, sibs, event)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={fluidLearnMoreContent(ctx)} />}
      persistKey={`fluid:${event.id}`}
    />
  );
}
