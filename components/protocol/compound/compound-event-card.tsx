"use client";

// Composer: fills the shared event card's slots (components/shared/
// event-card.tsx; ui-jobs 309) from a Comet event: the head, the Collateral
// and Debt ledger cells, the rate note and the absorb breakdown as notes, the
// price row, the explanation and the Learn More modal.

import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import type { SpineColumnProps } from "@/components/shared/spine-column";
import { ownerPaidGas } from "@/components/shared/event-price-row";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type CompoundCoords } from "@/lib/compound/event-provenance";
import { useCometMarket } from "@/lib/compound/deployment-context";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { compoundExplainerTeaser, type CompoundEvent } from "@/lib/compound/explainer-clauses";
import { useCompoundHeadSpec } from "./compound-event-header";
import { useCompoundCells } from "./compound-event-detail";
import type { CompoundPreviousRow } from "./compound-absorb-breakdown";
import { CompoundEventExplainer, compoundLearnMoreContent } from "./compound-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { compoundRowLabel } from "@/lib/compound/row-facts";

export interface CompoundEventCardProps {
  event: CompoundEvent;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the absorb-leg seam (defaults to just this one). */
  siblings?: CompoundEvent[];
  /** The account's previous row in this market (previousEventById), or — where
   *  it sits inside a folder the page has not opened — that folder's last
   *  block and time, with no balance. */
  previous?: CompoundEvent | CompoundPreviousRow;
  /** The last row of the previous transaction (previousEventByTx), the same way. */
  previousTx?: CompoundEvent | CompoundPreviousRow;
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

export function CompoundEventCard({
  event,
  isLast,
  eventNumber,
  siblings,
  previous,
  previousTx,
}: CompoundEventCardProps) {
  const prevRow = (e?: CompoundEvent | CompoundPreviousRow): CompoundPreviousRow | undefined =>
    e == null
      ? undefined
      : "context" in e
        ? { blockNumber: e.blockNumber, timestamp: e.timestamp, baseAfter: e.context.data.baseAfter }
        : e;
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
    ...(ctx.quoteUsd != null ? { quoteUsd: ctx.quoteUsd } : {}),
  };
  const kind = ctx.eventType;
  const isTransfer =
    kind === "transfer_in" ||
    kind === "transfer_out" ||
    kind === "transfer_collateral_in" ||
    kind === "transfer_collateral_out";

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
              unit: ctx.assetSymbol,
            },
          ];

  const spine: SpineColumnProps = isLiq
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : { tokens, externalParty: !!extBy, isLast: !!isLast };

  const head = useCompoundHeadSpec({
    actionLabel: compoundRowLabel(ctx, event.actionLabel ?? "", m.baseDecimals),
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    externalBy: extBy ?? undefined,
    wallet: event.wallet,
    flows: event.flows,
  });
  // The collateral and debt cells open into their ledgers where the page ties
  // its timeline to the Lifetime flows panel.
  const { cells, ledgers, notes, prices } = useCompoundCells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
    eventId: event.id,
    previous: prevRow(previous),
    previousTx: prevRow(previousTx),
  });

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "compound",
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
    ledgers,
    notes,
    price: { gas: ownerPaidGas(event, ctx.txFrom), prices },
    explainer: {
      body: (
        <CompoundEventExplainer
          ctx={ctx}
          event={event}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          siblings={sibs}
          skipLead
        />
      ),
      first: compoundExplainerTeaser(ctx, coords, sibs, event, m) ?? undefined,
    },
    learnMore: <LearnMore inline content={compoundLearnMoreContent(ctx)} />,
  };

  return <EventCard slots={slots} avatar={null} />;
}
