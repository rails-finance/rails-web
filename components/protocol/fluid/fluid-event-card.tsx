"use client";

// Fluid's event card on the shared shell's slots (ui-jobs 309 step 8): the
// head from fluid-event-header.tsx, T2 from fluid-sheet.tsx (an operate or a
// liquidation) or fluid-cells.tsx (an NFT move), the explanation
// and the Learn More from fluid-event-explainer.tsx. Gas stands in the price
// row where the owner in force signed the transaction (lib/shared/index-gas.ts).

import type { FluidContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { ownerPaidGas } from "@/components/shared/event-price-row";
import { FluidLedgerProvider } from "./fluid-ledger";
import type { SpineColumnProps, SpineWarningLeg } from "@/components/shared/spine-column";
import { EventPageContext } from "@/components/shared/event-page-aside";
import { useContext } from "react";
import { FLUID_HEAD_WORDS, fluidT1Caption } from "@/lib/fluid/head-words";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type FluidCoords } from "@/lib/fluid/event-provenance";
import { pairLabel } from "@/lib/fluid/asset-catalog";

import { fluidExplainerTeaser, fundedSameTx, transferRoundTrip, type FluidEvent } from "@/lib/fluid/explainer-clauses";
import { useFluidHeadSpec } from "./fluid-event-header";
import { useFluidCells } from "./fluid-cells";
import { fluidSheet, useFluidSheetFacts } from "./fluid-sheet";
import { FluidEventExplainer, fluidLearnMoreContent } from "./fluid-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { fluidMintContent } from "@/lib/shared/learn-more-content";

export interface FluidEventCardProps {
  event: FluidEvent;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the split-open seam (defaults to just this one). */
  siblings?: FluidEvent[];
  /** The mint of the same transaction, when this card is the position's Open
   *  row: the first operate and the mint drawn as one card. */
  openedBy?: FluidEvent;
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

export function FluidEventCard({ event, isLast, eventNumber, siblings, openedBy }: FluidEventCardProps) {
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
  // by its own delta; a single-leg kind uses its canonical direction.
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
  };
  const debtRow = {
    symbol: borrowSym,
    address: soleFlowAddress(event.flows, ctx.borrowSymbol),
    value: Math.abs(debtD),
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

  // A liquidation's per-position impact, the collateral seized below the debt
  // cleared: the warning node's flank carries it.
  const warningLegs = ((): SpineWarningLeg[] | undefined => {
    if (!isLiq) return undefined;
    const legs: SpineWarningLeg[] = [];
    const seized = Number(ctx.liqSupplyBefore ?? "0") - Number(ctx.liqSupplyAfter ?? "0");
    const cleared = Number(ctx.liqBorrowBefore ?? "0") - Number(ctx.liqBorrowAfter ?? "0");
    if (Number.isFinite(seized) && seized > 0)
      legs.push({
        label: FLUID_HEAD_WORDS.legSeized,
        value: seized,
        symbol: supplySym,
        address: colRow.address,
        direction: "left",
      });
    if (Number.isFinite(cleared) && cleared > 0)
      legs.push({ label: FLUID_HEAD_WORDS.legCleared, value: cleared, symbol: borrowSym, address: debtRow.address });
    return legs;
  })();

  const spine: SpineColumnProps = isLiq
    ? { icon: "warning", warningTone: "critical", warningLegs, isLast: !!isLast }
    : ctx.eventType === "mint"
      ? { icon: "mint", isLast: !!isLast }
      : ctx.eventType === "transfer"
        ? // An ownership handover is a people event with no token flow — the
          // person glyph with the join badge marks the new owner taking over.
          { icon: "delegate", iconDirection: "up", isLast: !!isLast }
        : { tokens, externalParty: !!extBy, isLast: !!isLast };

  // T1's word, which the phone spine view's caption repeats. A hop of an NFT
  // round trip inside one transaction says so at T1; the explainer states the
  // holder it left and came back to.
  const roundTrip = transferRoundTrip(sibs, event) != null;
  const headLabel = openedBy
    ? "Open"
    : roundTrip
      ? "Ownership transfer · round trip in this transaction"
      : event.actionLabel;

  // The timeline's head is words (decision 0045); the event page's card keeps
  // the head its title states.
  const page = useContext(EventPageContext) != null;
  const head = useFluidHeadSpec({
    mode: page ? "title" : "row",
    opened: openedBy != null,
    roundTrip,
    actionLabel: headLabel,
    ctx,
    timestamp: event.timestamp,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    eventNumber,
    externalBy: extBy ?? undefined,
    wallet: ctx.ownerAt ?? event.wallet,
    flows: event.flows,
  });
  // The owner's gas: the transaction's, stated on its first row, where the
  // owner in force signed it. An Open row is the mint's transaction, whose
  // first row is the mint. A liquidation is the liquidator's.
  const owner = ctx.ownerAt ?? event.wallet;
  const gasRow = openedBy?.gas ?? event.gas;
  const gas = isLiq
    ? undefined
    : ownerPaidGas({ wallet: owner, gas: gasRow }, ctx.txFrom ?? openedBy?.context.data.txFrom);
  const price = gas ? { gas, prices: [] } : undefined;
  const opening = openedBy != null || fundedSameTx(sibs, event);
  const body = useFluidCells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    mintedTo: openedBy?.context.data.transferTo,
    opening,
    price,
  });
  const sheetFacts = useFluidSheetFacts();
  const sheet = fluidSheet({
    ctx,
    coords,
    opening,
    facts: sheetFacts,
    eventId: event.id,
    addresses: { collateral: colRow.address, debt: debtRow.address },
  });

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "fluid",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: page ? headLabel : fluidT1Caption(ctx, headLabel, { opened: openedBy != null, roundTrip }),
    actor: {
      by: extBy ?? (ctx.eventType === "liquidated" ? ctx.liquidator : undefined) ?? undefined,
      // The transaction-sender test, the NFT's mint and transfer among the
      // kinds (ui-jobs 304).
      sent: { txFrom: ctx.txFrom ?? openedBy?.context.data.txFrom, caller: ctx.initiator, owner },
    },
    cells: body.cells,
    sheet,
    // The Collateral and Debt cells open into their ledgers where the page
    // ties its timeline to the Lifetime flows panel.
    ledgers: {
      provider: (children) => (
        <FluidLedgerProvider eventId={event.id} eventTs={event.timestamp}>
          {children}
        </FluidLedgerProvider>
      ),
    },
    notes: body.notes,
    price: body.price,
    explainer: {
      body: (
        <FluidEventExplainer
          ctx={ctx}
          event={event}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          siblings={sibs}
          skipLead
          openedBy={openedBy}
        />
      ),
      first: fluidExplainerTeaser(ctx, coords, sibs, event, { openedBy }),
    },
    learnMore: <LearnMore inline content={openedBy ? fluidMintContent() : fluidLearnMoreContent(ctx)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
