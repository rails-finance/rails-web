"use client";

// Composer: wires the Comet header / detail into the universal EventCard shell,
// plus the Plain English explainer + Learn More modal (reference depth).

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { movedDeltaProv, type CompoundCoords } from "@/lib/compound/event-provenance";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { compoundExplainerTeaser, type CompoundEvent } from "@/lib/compound/explainer-clauses";
import { CompoundEventHeader } from "./compound-event-header";
import { CompoundEventDetail } from "./compound-event-detail";
import { CompoundEventExplainer, compoundLearnMoreContent } from "./compound-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";

export interface CompoundEventCardProps {
  event: CompoundEvent;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the absorb-leg seam (defaults to just this one). */
  siblings?: CompoundEvent[];
}

// direction "right" = token leaves the account (supply / add collateral),
// "left" = token arrives at the account (withdraw). A transfer is neither — the
// balance changed hands between Comet accounts, nothing entered or left the
// Comet — so the four transfer kinds have no entry here: the row draws the
// asset with the custody badge and no flank, and the header carries the
// amount and the counterparty.
type CompoundTransferKind = "transfer_out" | "transfer_collateral_out" | "transfer_in" | "transfer_collateral_in";
const DIRECTION: Record<Exclude<CompoundContext["eventType"], CompoundTransferKind>, "right" | "left"> = {
  supply: "right",
  withdraw: "left",
  supply_collateral: "right",
  withdraw_collateral: "left",
  absorb_debt: "left",
  absorb_collateral: "left",
};

export function CompoundEventCard({ event, isFirst, isLast, eventNumber, siblings }: CompoundEventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const isLiq = ctx.eventType === "absorb_debt" || ctx.eventType === "absorb_collateral";
  const mag = Math.abs(Number(ctx.assetsDelta));
  // Third-party action: the account owner neither signed the tx nor provided
  // the funds (the builder only sets the facts on the funder-carrying supply
  // events — withdraws' counterparty is a recipient and never marks). Passive
  // events ride the dotted spine with the pink external-party glyph; the
  // header keeps the moved amount plus the "by 0x…" chip.
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.funder }, event.wallet);

  // Echo the spine flank value into the header's moved-amount receipt so the
  // picker can target it: the SpineValProv must carry the SAME info/value/symbol
  // the header registers. Only when the spine value IS that single moved figure
  // (the token branch below; liquidations and external-funded events don't draw
  // a flank).
  // The market resolves against the DEPLOYMENT this page is about (the slugs
  // collide across chains — Base's cUSDCv3 is `usdc` too), and the chain and
  // capture source ride the coords so the receipt's link and custody line say
  // where this event actually came from.
  const m = useCometMarket(ctx.market);
  const coords: CompoundCoords = {
    comet: m.comet,
    marketLabel: m.label,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  // A transfer draws no flank (see `tokens` below), so it echoes nothing.
  const kind = ctx.eventType;
  const isTransfer =
    kind === "transfer_in" ||
    kind === "transfer_out" ||
    kind === "transfer_collateral_in" ||
    kind === "transfer_collateral_out";
  const signedDelta = Number(ctx.assetsDelta) || 0;
  const movedProv = isTransfer ? null : movedDeltaProv(ctx.eventType, ctx.assetSymbol, coords);
  const spineProv =
    movedProv != null
      ? { info: movedProv, value: chainTruthDeltaValue(signedDelta, false), symbol: ctx.assetSymbol }
      : undefined;

  // Hand the icon chip the asset's contract as well as its symbol. A Comet's
  // base and collateral assets are a curated list, so the house symbol table
  // answers for them today; what it cannot do is follow a new collateral being
  // added to a Comet, whereas the flows describe whatever actually moved. Only
  // an unambiguous match is used — one flow, one symbol — because resolving a
  // shared symbol by picking a flow is the error this whole change is undoing.
  //
  // A transfer is a custody move: the token's icon wears the paper-plane badge
  // and neither flank is drawn — the two flanks are "out to the wallet" and
  // "into the protocol", and a transfer to another account is neither. The
  // header states the amount and the to/from counterparty.
  const tokens =
    isLiq || mag === 0
      ? undefined
      : isTransfer
        ? [
            {
              symbol: ctx.assetSymbol,
              address: soleFlowAddress(event.flows, ctx.assetSymbol),
              badge: "send" as const,
            },
          ]
        : [
            {
              symbol: ctx.assetSymbol,
              address: soleFlowAddress(event.flows, ctx.assetSymbol),
              direction: DIRECTION[kind],
              value: mag,
              prov: spineProv,
            },
          ];

  const iconSlot = isLiq ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel="Liquidation"
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
        <CompoundEventHeader
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
      detail={<CompoundEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} />}
      detailLabel="Position state"
      explainer={
        <CompoundEventExplainer
          ctx={ctx}
          event={event}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          siblings={sibs}
          skipLead
        />
      }
      explainerLabel="Plain English"
      explainerTeaser={compoundExplainerTeaser(ctx, coords, sibs, event, m)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={compoundLearnMoreContent(ctx)} />}
      persistKey={`compound:${event.id}`}
    />
  );
}
