"use client";

// PWN's event card on the shared shell's slots (ui-jobs 309 step 8): the head
// from pwn-event-header.tsx, T2 from pwn-cells.tsx, the explanation and the
// Learn More from pwn-event-explainer.tsx. Gas stands in the price row where
// the viewed wallet signed the transaction (lib/shared/index-gas.ts). A flow
// row's Collateral and Debt open into the loan's ledgers (pwn-ledger.tsx);
// the other rows draw no ledger.

import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { gasPrice } from "@/components/shared/event-price-row";
import { ownerPaidGas } from "@/lib/shared/index-gas";
import type { SpineColumnProps } from "@/components/shared/spine-column";

import { soleFlowAddress } from "@/lib/shared/format-event";
import { rowRepay, type PwnCoords } from "@/lib/pwn/event-provenance";
import { pwnExplainerTeaser, type PwnEvent } from "@/lib/pwn/explainer-clauses";
import { fullAmount, usePwnHeadSpec } from "./pwn-event-header";
import { usePwnCells } from "./pwn-cells";
import { PwnEventExplainer, pwnLearnMoreContent } from "./pwn-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { PwnLedgerProvider } from "./pwn-ledger";

export interface PwnEventCardProps {
  event: PwnEvent;
  isLast?: boolean;
  eventNumber?: number;
  /** Same-tx sibling events — the custody cross-reference seam (defaults to just
   *  this one). */
  siblings?: PwnEvent[];
}

export function PwnEventCard({ event, isLast, eventNumber, siblings }: PwnEventCardProps) {
  const ctx = event.context.data;
  const sibs = siblings ?? [event];
  const isSeizure = ctx.eventType === "claimed" && ctx.defaulted === true;

  // Token glyph on the spine for the value-moving events. direction "left" =
  // toward the wallet (credit received at creation, repayment claimed by the
  // lender), "right" = toward the protocol (repayment). The LOAN-token lifecycle
  // events (minted / burned) and the renegotiation (extended) move no value —
  // they carry a semantic glyph instead of a token (below).
  const coords: PwnCoords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    loanId: ctx.loanId,
    version: ctx.version,
  };

  // PWN is peer-to-peer: the credit asset is whatever the two parties agreed
  // on, so its symbol comes from an open set and the house address table is
  // never going to name most of it — which is when the icon chip stops trying
  // and prints an initial. The loan's own flows record the credit contract, so
  // the address is read from there once and shared by every branch below. The
  // helper answers only on a single symbol match, because a mark pinned to the
  // wrong contract states something untrue where a letter states nothing.
  const creditAddress = soleFlowAddress(event.flows, ctx.creditSymbol);
  let tokens:
    | {
        symbol: string;
        address?: string;
        direction: "right" | "left";
        value?: number;
        display?: string;
        unit?: string;
      }[]
    | undefined;
  if (ctx.eventType === "created" && ctx.creditSymbol) {
    const v = Math.abs(Number(ctx.creditAmount ?? "0"));
    if (v > 0)
      tokens = [
        {
          symbol: ctx.creditSymbol,
          address: creditAddress,
          direction: "left",
          value: v,
          display: fullAmount(v),
          unit: ctx.creditSymbol,
          // Echoes the header's creditAdvancedProv (pwn-event-header.tsx) —
          // always positive, so the header's unlabeled (signed) value is "+".
        },
      ];
  } else if (ctx.eventType === "paid_back" && ctx.creditSymbol) {
    const r = rowRepay(ctx, coords);
    const v = Math.abs(Number(r?.amount ?? "0"));
    if (v > 0 && r)
      tokens = [
        {
          symbol: ctx.creditSymbol,
          address: creditAddress,
          direction: "right",
          value: v,
          display: fullAmount(v),
          unit: ctx.creditSymbol,
          // Echoes the header's repayment receipt — same "+"-signed grammar.
        },
      ];
  } else if (ctx.eventType === "claimed" && !ctx.defaulted && ctx.creditSymbol) {
    // Non-default claim: the note holder collects the repaid credit — it flows
    // to the wallet, mirroring `created` but in the opposite direction of
    // `paid_back`. Echoes the header's repayAmountProv (the collected amount
    // IS the terms' repay total), the same "+"-signed grammar as the others.
    const r = rowRepay(ctx, coords);
    const v = Math.abs(Number(r?.amount ?? "0"));
    if (v > 0 && r)
      tokens = [
        {
          symbol: ctx.creditSymbol,
          address: creditAddress,
          direction: "left",
          value: v,
          display: fullAmount(v),
          unit: ctx.creditSymbol,
        },
      ];
    else tokens = [{ symbol: ctx.creditSymbol, address: creditAddress, direction: "left" }];
  }

  // Semantic glyph for the events that move no token. minted/burned are the
  // LOAN-token lifecycle (system side-effects → dotted spine); extended is a
  // deliberate renegotiation → solid.
  const lifecycleIcon =
    ctx.eventType === "minted"
      ? ("mint" as const)
      : ctx.eventType === "burned"
        ? ("burn" as const)
        : ctx.eventType === "extended"
          ? ("extend" as const)
          : undefined;

  const spine: SpineColumnProps = isSeizure
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : lifecycleIcon
      ? { icon: lifecycleIcon, isLast: !!isLast }
      : { tokens, isLast: !!isLast };

  const head = usePwnHeadSpec({
    actionLabel: event.actionLabel,
    ctx,
    timestamp: event.timestamp,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    eventNumber,
    flows: event.flows,
  });
  const body = usePwnCells({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    timestamp: event.timestamp,
    siblings: sibs,
    eventId: event.id,
  });
  const flowRow = ctx.eventType === "created" || ctx.eventType === "paid_back" || isSeizure;

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "pwn",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: event.actionLabel,
    cells: body.cells,
    ledgers: flowRow
      ? {
          provider: (children) => (
            <PwnLedgerProvider eventId={event.id} eventTs={event.timestamp} flowRow>
              {children}
            </PwnLedgerProvider>
          ),
        }
      : { none: "A row that moves no collateral or credit has no ledger" },
    notes: body.notes,
    price: gasPrice(ownerPaidGas(event.gas, ctx.txFrom, event.wallet)),
    explainer: {
      body: <PwnEventExplainer ctx={ctx} event={event} siblings={sibs} skipLead />,
      first: pwnExplainerTeaser(ctx, coords, sibs, event),
    },
    learnMore: <LearnMore inline content={pwnLearnMoreContent(ctx)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
