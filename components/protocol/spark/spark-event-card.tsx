"use client";

// A SparkLend event's card on the shared shell's slots (rails-ops
// reference/shared-event-card-spec.md §3, §4; ui-jobs 309 step 6): the spine,
// the head (spark-event-header.tsx), the cells, notes and prices of T2
// (spark-event-detail.tsx, the Aave V3 family's cells), the explanation and
// the Learn-More "?".

import type { BaseActivityEvent, SparkContext } from "@/lib/shared/types/event-shape";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";

import type { SpineColumnProps } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type SparkCoords } from "@/lib/spark/event-provenance";
import { sparkExplainerTeaser } from "@/lib/spark/explainer-clauses";
import { sparkHeadSpec } from "./spark-event-header";
import { useSparkEventBody } from "./spark-event-detail";
import { SparkEventExplainer, sparkLearnMoreContent } from "./spark-event-explainer";
import { AaveFamilyLedgers } from "@/components/protocol/aave-v3/aave-family-cells";
import { useCallback, useState } from "react";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { prefetchAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import type { AaveV3Neighbours } from "@/lib/aave-v3/event-neighbours";
import { isGatewayWithdrawal, sparkFeeLiquidation, type SparkTimelineEvent } from "@/lib/spark/liquidation-fee";

export interface SparkEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "spark"; data: SparkContext } };
  isLast?: boolean;
  eventNumber?: number;
  /** "spark" where the account state around this transaction can be read at
   *  blocks N−1 and N; unset where another of the owner's transactions shares
   *  the block (the read would mix the two). */
  market?: "spark";
  /** This transaction's rows (a liquidation and its fee transfer). */
  siblings?: SparkTimelineEvent[];
  /** The previous transaction, to say what moved the account between events. */
  previous?: AaveV3Neighbours<SparkTimelineEvent>["previous"];
}

// direction "right" = token moves toward the protocol (deposit / repay),
// "left" = toward the wallet (withdraw / borrow). A transfer is neither — the
// spToken changed hands, nothing entered or left the Pool — so it has no entry
// here: the row draws the reserve with the custody badge and no flank, and
// the header carries the amount and the counterparty.
const DIRECTION: Record<
  Exclude<SparkContext["eventType"], "transfer_in" | "transfer_out" | "emode">,
  "right" | "left"
> = {
  supply: "right",
  withdraw: "left",
  borrow: "left",
  repay: "right",
  liquidation: "left",
};

export function SparkEventCard({ event, isLast, eventNumber, market, siblings, previous }: SparkEventCardProps) {
  const ctx = event.context.data;
  // A transfer to the Spark treasury in a liquidation's transaction is that
  // liquidation's fee (lib/spark/liquidation-fee.ts): it reads the
  // liquidation's account state, so it asks for none of its own.
  const feeOf = sparkFeeLiquidation(ctx, siblings);
  const stateMarket = feeOf ? undefined : market;
  const reserveAddress = soleFlowAddress(event.flows, ctx.reserveSymbol);
  const prefetch = () => {
    if (!stateMarket) return;
    prefetchAaveV3PositionState({
      wallet: event.wallet,
      market: stateMarket,
      block: event.blockNumber,
      txHash: event.txHash,
    });
    prefetchAaveV3PositionState({
      wallet: event.wallet,
      market: stateMarket,
      block: previous?.blockNumber,
      txHash: previous?.txHash,
    });
  };
  const isLiq = ctx.eventType === "liquidation";
  const mag = Math.abs(Number(ctx.assetsDelta));
  // Third-party action: the owner neither signed the tx nor made the Pool
  // call. Passive events ride the dotted spine; the pink external-party glyph
  // (the V2 delegate tint) replaces the token flow, and the header keeps the
  // moved amount plus the "by 0x…" chip.
  const extBy = externalActor(ctx, event.wallet);

  const coords: SparkCoords = { txHash: event.txHash, blockNumber: event.blockNumber };
  const kind = ctx.eventType;
  // A withdrawal as ETH through the gateway, and a liquidation's fee, leave the
  // position like a withdrawal: they draw the outgoing flank with the amount.
  // A plain transfer stays a custody row.
  const outFlow = isGatewayWithdrawal(ctx) || !!feeOf;
  const isTransfer = !outFlow && (kind === "transfer_in" || kind === "transfer_out");

  // The reserve's contract goes to the chip alongside its symbol. SparkLend
  // lists a fixed set the house address table already covers, so no row here is
  // drawing a letter today; what changes is that the mark now comes from what
  // the event says moved rather than from a table that has to be kept in step
  // with the reserve list. One flow per symbol or nothing — a shared symbol
  // resolved by picking a flow would be the original mistake, one level down.
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
              symbol: ctx.reserveSymbol,
              address: soleFlowAddress(event.flows, ctx.reserveSymbol),
              badge: "send" as const,
            },
          ]
        : [
            {
              symbol: ctx.reserveSymbol,
              address: soleFlowAddress(event.flows, ctx.reserveSymbol),
              direction: outFlow ? ("left" as const) : DIRECTION[kind as keyof typeof DIRECTION],
              value: mag,
              unit: ctx.reserveSymbol,
              fullValue: true,
            },
          ];

  const spine: SpineColumnProps = isLiq
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : { tokens, externalParty: !!extBy, isLast: !!isLast };

  // The reads start when the card first opens.
  const [active, setActive] = useState(false);
  const onOpen = useCallback(() => setActive(true), []);
  const body = useSparkEventBody({
    active,
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    market: stateMarket,
    reserveAddress,
    previous,
    eventTs: event.timestamp,
  });

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "spark",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head: sparkHeadSpec({
      actionLabel: event.actionLabel,
      ctx,
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      externalBy: extBy ?? undefined,
      wallet: event.wallet,
      flows: event.flows,
      feeOf,
    }),
    caption: event.actionLabel,
    actor: { by: extBy ?? undefined },
    cells: body.cells,
    cellsData: body.cellsData,
    ledgers: stateMarket
      ? {
          provider: (children) => (
            <AaveFamilyLedgers
              state={body.state}
              coords={body.stateCoords}
              eventId={event.id}
              eventTs={event.timestamp}
            >
              {children}
            </AaveFamilyLedgers>
          ),
        }
      : {
          none: feeOf
            ? "A liquidation fee's row states the fee; the account's ledgers are on the liquidation's card."
            : "Another of the owner's transactions shares this block, so the account is not read: the cells state the event's balances.",
        },
    notes: body.notes,
    // The index carries no gas for SparkLend's rows and the account read reads
    // none, so the row states no owner-paid gas.
    price: { gas: null, prices: body.prices },
    explainer: {
      body: (
        <SparkEventExplainer
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          owner={event.wallet}
          market={stateMarket}
          reserveAddress={reserveAddress}
          siblings={siblings}
          previous={previous}
          skipLead
        />
      ),
      first: sparkExplainerTeaser(ctx, coords, { owner: event.wallet, siblings }) ?? undefined,
    },
    learnMore: <LearnMore inline content={sparkLearnMoreContent(feeOf ?? ctx)} />,
    onIntent: prefetch,
    onOpen,
  };

  return <EventCard slots={slots} avatar={null} />;
}
