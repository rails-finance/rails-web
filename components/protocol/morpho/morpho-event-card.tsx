"use client";

// Composer: wires the Morpho header / detail into the universal EventCard shell,
// with the Plain English explainer + per-mechanic Learn More alongside the
// chain-state detail grid.

import type { BaseActivityEvent, MorphoContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { MorphoEventHeader } from "./morpho-event-header";
import { MorphoEventDetail } from "./morpho-event-detail";
import { MorphoEventExplainer, morphoLearnMoreContent } from "./morpho-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { assetsDeltaProv, type MorphoCoords } from "@/lib/morpho/event-provenance";
import { morphoExplainerTeaser } from "@/lib/morpho/explainer-clauses";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface MorphoEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "morpho"; data: MorphoContext } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
}

// direction "right" = token moves toward the protocol (deposit / repay / supply),
// "left" = toward the wallet (withdraw / borrow).
const DIRECTION: Record<MorphoContext["eventType"], "right" | "left"> = {
  supply_collateral: "right",
  withdraw_collateral: "left",
  borrow: "left",
  repay: "right",
  supply: "right",
  withdraw: "left",
  liquidation: "left",
};

export function MorphoEventCard({ event, isFirst, isLast, eventNumber }: MorphoEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
  const sym = ctx.side === "collateral" ? ctx.collateralSymbol : ctx.loanSymbol;
  const delta = Number(ctx.assetsDelta) || 0;
  const mag = Math.abs(delta);
  // Third-party action: the owner (onBehalf) neither signed the tx nor made
  // the Morpho call. Such events ride the dotted spine and badge the token
  // icon pink, and the header names the actor in a "by …" chip — but the flow
  // itself still renders. WHO acted annotates WHAT moved; it never replaces it.
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

  // The spine value IS the event's own logged amount (no fee/redistribution
  // component separating them), so it echoes the assets-delta receipt.
  //
  // The echo's key is `receiptLabel|value|symbol` byte-for-byte, so the value
  // MUST be built through chainTruthDeltaValue — the same helper the header
  // registers with — which keeps the sign (U+2212 for negatives). This card
  // used to pass a bare `formatExact(mag)`: unsigned, never matching, and
  // silently so. The miss was invisible while the pink external glyph was
  // displacing the flank on exactly the positions that would have shown it.
  // The chain and the capture lane are route facts read from context, so the
  // receipts name the right explorer and the right custody on a Base page.
  const coords: MorphoCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    marketId: ctx.marketId,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  // The spine chip needs the token's address, not its symbol: Morpho Blue is
  // permissionless, the house symbol → address table names a fraction of what
  // appears here, and an unnamed symbol reaches neither icon CDN and draws its
  // initial letter. The event already knows the contract — its flows record the
  // transfer that happened — and soleFlowAddress reads it under the same
  // single-match rule the header uses, so a symbol two flows share resolves to
  // nothing rather than to the wrong brand mark.
  const tokens =
    isLiq || mag === 0
      ? undefined
      : [
          {
            symbol: sym,
            address: soleFlowAddress(event.flows, sym),
            direction: DIRECTION[ctx.eventType],
            value: mag,
            prov: {
              info: assetsDeltaProv(sym, ctx.side, coords, ctx.eventType),
              value: chainTruthDeltaValue(delta, false),
              symbol: sym,
            },
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
        <MorphoEventHeader
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
      detail={<MorphoEventDetail ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} flows={event.flows} />}
      detailLabel="Position state"
      explainer={<MorphoEventExplainer ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} skipLead />}
      explainerLabel="Plain English"
      explainerTeaser={morphoExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={morphoLearnMoreContent(ctx)} />}
      persistKey={`morpho:${event.id}`}
    />
  );
}
