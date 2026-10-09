"use client";

// LlamaLend's event card on the shared shell's slots (ui-jobs 309 step 8): the
// head from llamalend-event-header.tsx, T2 from llamalend-cells.tsx (read
// when the card opens), the explanation and the Learn More from
// llamalend-event-explainer.tsx. Gas stands in the price row where the owner
// signed the transaction (lib/shared/index-gas.ts).
//
// A third-party hard liquidation is critical-toned on the spine and never
// renders a token-flow chip that reads like a send — a taking is not
// something the borrower did. A SELF-liquidation (liquidator == borrower) is
// the user's own close from soft-liquidation and flows normally.

import type { BaseActivityEvent, LlamalendContext } from "@/lib/shared/types/event-shape";
import { useMemo } from "react";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";
import { ownerPaidGas } from "@/components/shared/event-price-row";
import { LlamalendLedgerProvider } from "./llamalend-ledger";
import type { SpineColumnProps } from "@/components/shared/spine-column";

import { type LlamalendCoords } from "@/lib/llamalend/event-provenance";
import { llamalendExplainerTeaser } from "@/lib/llamalend/explainer-clauses";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { useLlamalendHeadSpec } from "./llamalend-event-header";
import { LLAMALEND_HEADS, useLlamalendOpened } from "./llamalend-cells";
import { LlamalendEventExplainer, llamalendLearnMoreContent } from "./llamalend-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import type { LlamalendLoanMark, LlamalendNextRow, LlamalendPreviousStated } from "@/lib/llamalend/event-figures";

export interface LlamalendEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "llamalend"; data: LlamalendContext } };
  isLast?: boolean;
  eventNumber?: number;
  /** The last collateral balance an earlier row stated, for what the AMM
   *  sold since (lib/llamalend/event-figures.ts). */
  previousStated?: LlamalendPreviousStated | null;
  /** Where the event sits among the page's loans (llamalendLoanMarks). */
  loanMark?: LlamalendLoanMark | null;
  /** The market's liquidation discount now (the page's live read). */
  marketDiscount?: number | null;
  /** Whether the controller has approvals (the page's live read). */
  controllerHasApprovals?: boolean | null;
  /** The loan's next row (llamalendNextRowMap). */
  next?: LlamalendNextRow | null;
}

export function LlamalendEventCard({
  event,
  isLast,
  eventNumber,
  previousStated,
  loanMark,
  marketDiscount,
  controllerHasApprovals,
  next,
}: LlamalendEventCardProps) {
  const ctx = event.context.data;
  // Only the BORROWER's leg of a third-party liquidation is a passive loss;
  // the liquidator's leg and a self-liquidation are the subject's own acts.
  const isBorrowerLoss =
    ctx.eventType === "liquidation" && (ctx.role ?? "borrower") === "borrower" && !ctx.selfLiquidation;

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
  }[] = [];
  const coll = Number(ctx.collateralDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  if (coll !== 0)
    tokens.push({
      symbol: ctx.collateralSymbol,
      address: soleFlowAddress(event.flows, ctx.collateralSymbol),
      direction: coll > 0 ? "left" : "right",
      value: Math.abs(coll),
    });
  if (debt !== 0)
    tokens.push({
      symbol: ctx.borrowedSymbol,
      address: soleFlowAddress(event.flows, ctx.borrowedSymbol),
      direction: debt > 0 ? "left" : "right",
      value: Math.abs(debt),
    });

  const spine: SpineColumnProps = isBorrowerLoss
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : { tokens: tokens.length > 0 ? tokens : undefined, isLast: !!isLast };

  const head = useLlamalendHeadSpec({
    actionLabel: event.actionLabel,
    ctx,
    timestamp: event.timestamp,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    eventNumber,
    wallet: event.wallet,
    flows: event.flows,
    loanMark,
  });
  // The owner's gas: a liquidator's taking, and a row where the page's wallet
  // liquidated someone else, are not the position's cost.
  const gas = isBorrowerLoss || ctx.role === "liquidator" ? undefined : ownerPaidGas(event, ctx.txFrom);
  const price = gas ? { gas, prices: [] } : undefined;
  const ledgerEvent = useMemo(
    () => ({
      ctx,
      coords: { txHash: event.txHash, blockNumber: event.blockNumber, controller: ctx.controller, user: event.wallet },
    }),
    [ctx, event.txHash, event.blockNumber, event.wallet],
  );

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "llamalend",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: event.actionLabel,
    cells: { pending: LLAMALEND_HEADS },
    // The Collateral and Debt cells open into their ledgers where the page
    // ties its timeline to the Lifetime flows panel; the Collateral ledger
    // closes on what the AMM had converted.
    ledgers: {
      provider: (children) => (
        <LlamalendLedgerProvider eventId={event.id} eventTs={event.timestamp} event={ledgerEvent}>
          {children}
        </LlamalendLedgerProvider>
      ),
    },
    price,
    useOpened: () =>
      useLlamalendOpened({
        ctx,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
        wallet: event.wallet,
        previousStated,
        price,
      }),
    explainer: {
      body: (
        <LlamalendEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          skipLead
          loanMark={loanMark}
          marketDiscount={marketDiscount}
          next={next}
        />
      ),
      first: llamalendExplainerTeaser(ctx, coords, loanMark),
    },
    learnMore: <LearnMore inline content={llamalendLearnMoreContent(ctx, controllerHasApprovals ?? null)} />,
  };
  return <EventCard slots={slots} avatar={null} />;
}
