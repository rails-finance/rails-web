"use client";

// Morpho's event card on the shared shell's slots (ui-jobs 309 step 8): the
// head from morpho-event-header.tsx, T2 from morpho-cells.tsx, the
// explanation and the Learn More from morpho-event-explainer.tsx.

import type { BaseActivityEvent, MorphoContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { gasPrice } from "@/components/shared/event-price-row";
import { useMorphoNeighbours } from "@/lib/morpho/timeline-neighbours";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { useMorphoHeadSpec } from "./morpho-event-header";
import { useMorphoCells, useMorphoOpened } from "./morpho-cells";
import { MorphoLedgerProvider } from "./morpho-ledger";
import { MorphoEventExplainer, morphoLearnMoreContent } from "./morpho-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { type MorphoCoords } from "@/lib/morpho/event-provenance";
import { morphoExplainerTeaser } from "@/lib/morpho/explainer-clauses";

import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface MorphoEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "morpho"; data: MorphoContext } };
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

export function MorphoEventCard({ event, isLast, eventNumber }: MorphoEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
  const sym = ctx.side === "collateral" ? ctx.collateralSymbol : ctx.loanSymbol;
  const delta = Number(ctx.assetsDelta) || 0;
  const mag = Math.abs(delta);
  // The first event of its transaction, which states the transaction's gas.
  const firstInTx = (useMorphoNeighbours(event.id)?.earlierInTx.length ?? 0) === 0;
  // Third-party action: the owner (onBehalf) neither signed the tx nor made
  // the Morpho call. Such events badge the token icon pink, and the head
  // names the actor in a "by …" chip — but the flow still renders.
  // WHO acted annotates WHAT moved; it never replaces it.
  const extBy = externalActor({ txFrom: ctx.txFrom, poolCaller: ctx.caller }, event.wallet);

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
  // permissionless, and an unnamed symbol reaches neither icon CDN and draws
  // its initial letter. The event's flows record the transfer; soleFlowAddress
  // reads it under the single-match rule.
  const spine: SpineColumnProps = isLiq
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : {
        tokens:
          mag === 0
            ? undefined
            : [
                {
                  symbol: sym,
                  address: soleFlowAddress(event.flows, sym),
                  direction: DIRECTION[ctx.eventType],
                  value: mag,
                },
              ],
        externalParty: !!extBy,
        isLast: !!isLast,
      };

  const head = useMorphoHeadSpec({
    actionLabel: event.actionLabel,
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    externalBy: extBy ?? undefined,
    wallet: event.wallet,
    flows: event.flows,
  });
  const cells = useMorphoCells(ctx, coords, event.flows);
  // The liquidator pays a liquidation's gas and a third party pays an acted
  // row's: neither is the owner's cost, so neither is stated. A transaction
  // carrying several events (Add Collateral and Borrow) states it on the
  // first of them.
  const price = gasPrice(isLiq || extBy || !firstInTx ? undefined : event.gas);

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "morpho",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: event.actionLabel,
    actor: { by: extBy ?? undefined },
    cells,
    // The Collateral (or Supplied) and Debt cells open into their ledgers
    // where the page ties its timeline to the Lifetime flows panel.
    ledgers: {
      provider: (children) => (
        <MorphoLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </MorphoLedgerProvider>
      ),
    },
    price,
    useOpened: () => useMorphoOpened(ctx, coords, event.flows, cells, price),
    explainer: {
      body: (
        <MorphoEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          eventId={event.id}
          skipLead
        />
      ),
      first: morphoExplainerTeaser(ctx, coords),
    },
    learnMore: <LearnMore inline content={morphoLearnMoreContent(ctx)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
