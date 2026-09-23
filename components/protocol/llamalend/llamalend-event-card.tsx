"use client";

// Composer: wires the LlamaLend header / detail / explainer into the universal
// EventCard shell (the plain-English explainer rides its own second-tier slot).
//
// A third-party hard liquidation is critical-toned on the spine and never
// renders a token-flow chip that reads like a send — a taking is not
// something the borrower did. A SELF-liquidation (liquidator == borrower) is
// the user's own close from soft-liquidation and flows normally.

import type { BaseActivityEvent, LlamalendContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import type { SpineValProv } from "@/components/shared/activity-timeline";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import {
  collateralDeltaProv,
  debtDeltaProv,
  liquidationProv,
  type LlamalendCoords,
} from "@/lib/llamalend/event-provenance";
import { llamalendExplainerTeaser } from "@/lib/llamalend/explainer-clauses";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { LlamalendEventHeader } from "./llamalend-event-header";
import { LlamalendEventDetail } from "./llamalend-event-detail";
import { LlamalendEventExplainer, llamalendLearnMoreContent } from "./llamalend-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface LlamalendEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "llamalend"; data: LlamalendContext } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

export function LlamalendEventCard({ event, isFirst, isLast, eventNumber }: LlamalendEventCardProps) {
  const ctx = event.context.data;
  // Only the BORROWER's leg of a third-party liquidation is a passive loss;
  // the liquidator's leg and a self-liquidation are the subject's own acts.
  const isBorrowerLoss =
    ctx.eventType === "liquidation" && (ctx.role ?? "borrower") === "borrower" && !ctx.selfLiquidation;

  // Echo: the header registers collateralDeltaProv/debtDeltaProv (or, on a
  // liquidation, liquidationProv per LEG+role) for every nonzero delta —
  // llamalend-event-header.tsx never labels a delta, so every registered
  // value is SIGNED. The borrower's own liquidation leg draws no spine token
  // at all (isBorrowerLoss branches to the warning icon below), so it gets no
  // echo; the liquidator's leg and a self-liquidation render normally.
  const isLiq = ctx.eventType === "liquidation";
  const role = ctx.role ?? (isLiq ? "borrower" : undefined);
  const coords: LlamalendCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    controller: ctx.controller,
    user: event.wallet,
  };

  // Spine tokens: the event's own moved amounts. direction "right" = away
  // from the position, "left" = toward it (collateral in / borrowed drawn).
  //
  // Each row also carries the token's contract, taken from the event's flows,
  // which is what the icon chip actually needs — with only a symbol it falls
  // back to the house address table and, failing that, to an initial letter.
  // LlamaLend's markets are created per collateral and its long tail runs well
  // past anything that table names, so this is where the letters were. The
  // helper stays silent unless exactly one flow claims the symbol.
  const tokens: {
    symbol: string;
    address?: string;
    direction: "left" | "right";
    value: number;
    prov: SpineValProv;
  }[] = [];
  const coll = Number(ctx.collateralDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  if (coll !== 0)
    tokens.push({
      symbol: ctx.collateralSymbol,
      address: soleFlowAddress(event.flows, ctx.collateralSymbol),
      direction: coll > 0 ? "left" : "right",
      value: Math.abs(coll),
      prov: {
        info: isLiq
          ? liquidationProv("collateral", ctx.collateralSymbol, role ?? "borrower", coords, ctx.raw?.collateralDelta)
          : collateralDeltaProv(ctx.collateralSymbol, ctx.eventType, coords, ctx.raw?.collateralDelta),
        value: chainTruthDeltaValue(coll, false),
        symbol: ctx.collateralSymbol,
      },
    });
  if (debt !== 0)
    tokens.push({
      symbol: ctx.borrowedSymbol,
      address: soleFlowAddress(event.flows, ctx.borrowedSymbol),
      direction: debt > 0 ? "left" : "right",
      value: Math.abs(debt),
      prov: {
        info: isLiq
          ? liquidationProv("debt", ctx.borrowedSymbol, role ?? "borrower", coords, ctx.raw?.debtDelta)
          : debtDeltaProv(ctx.borrowedSymbol, ctx.eventType, coords, ctx.raw?.debtDelta),
        value: chainTruthDeltaValue(debt, false),
        symbol: ctx.borrowedSymbol,
      },
    });

  const iconSlot = isBorrowerLoss ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel="Liquidation"
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : (
    <SpineColumn tokens={tokens.length > 0 ? tokens : undefined} isFirst={isFirst} isLast={!!isLast} />
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={iconSlot}
      header={
        <LlamalendEventHeader
          actionLabel={event.actionLabel}
          ctx={ctx}
          timestamp={event.timestamp}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventNumber={eventNumber}
          wallet={event.wallet}
          flows={event.flows}
        />
      }
      detail={
        <LlamalendEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} wallet={event.wallet} />
      }
      detailLabel="Position state"
      explainer={
        <LlamalendEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={llamalendExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={llamalendLearnMoreContent(ctx)} />}
      persistKey={`llamalend:${event.id}`}
    />
  );
}
