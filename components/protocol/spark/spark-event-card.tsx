"use client";

// Composer: wires the SparkLend header / detail / explainer into the universal
// EventCard shell — the reference-depth card (uplifted from the chain-state
// baseline; the plain-English explainer rides its own second-tier slot).

import type { BaseActivityEvent, SparkContext } from "@/lib/shared/types/event-shape";
import { EventCard } from "@/components/shared/event-card";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { assetsDeltaProv, transferDeltaProv, type SparkCoords } from "@/lib/spark/event-provenance";
import { sparkExplainerTeaser } from "@/lib/spark/explainer-clauses";
import { SparkEventHeader } from "./spark-event-header";
import { SparkEventDetail } from "./spark-event-detail";
import { useMemo, useState } from "react";
import {
  ReceiptCalcButton,
  ReceiptCalcContext,
  useEventCum,
} from "@/components/protocol/aave-v3/aave-family-event-receipt";
import { SparkEventExplainer, sparkLearnMoreContent } from "./spark-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { prefetchAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import type { AaveV3Neighbours } from "@/lib/aave-v3/event-neighbours";
import { isGatewayWithdrawal, sparkFeeLiquidation, type SparkTimelineEvent } from "@/lib/spark/liquidation-fee";

export interface SparkEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "spark"; data: SparkContext } };
  isFirst?: boolean;
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

export function SparkEventCard({
  event,
  isFirst,
  isLast,
  eventNumber,
  market,
  siblings,
  previous,
}: SparkEventCardProps) {
  // The receipt's calculator (aave-family-event-receipt.tsx), and the (i)'s
  // slot for the interest line and the prices.
  const [calcOn, setCalcOn] = useState(false);
  const calc = useMemo(() => ({ on: calcOn, toggle: () => setCalcOn((v) => !v) }), [calcOn]);
  const hasSum = useEventCum(event.id) != null;
  const [notesSlot, setNotesSlot] = useState<HTMLElement | null>(null);
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

  // Echo the spine flank value into the header's registered reserve-delta
  // receipt so the picker can target it: same prov builder + args, same
  // signed-string helper, same symbol the header uses. Liquidations don't
  // draw a token flank (the warning icon replaces it), so no echo there.
  const coords: SparkCoords = { txHash: event.txHash, blockNumber: event.blockNumber };
  // A transfer draws no flank (see `tokens` below), so it echoes nothing.
  const kind = ctx.eventType;
  // A withdrawal as ETH through the gateway, and a liquidation's fee, leave the
  // position like a withdrawal: they draw the outgoing flank with the amount,
  // echoing the header's transfer receipt. A plain transfer stays a custody row.
  const outFlow = isGatewayWithdrawal(ctx) || !!feeOf;
  const isTransfer = !outFlow && (kind === "transfer_in" || kind === "transfer_out");
  const signedDelta = Number(ctx.assetsDelta) || 0;
  const spineProv =
    !isLiq && !isTransfer && signedDelta !== 0
      ? {
          info: outFlow
            ? transferDeltaProv(ctx.reserveSymbol, "out", coords)
            : assetsDeltaProv(ctx.reserveSymbol, ctx.side, coords),
          value: chainTruthDeltaValue(signedDelta, false),
          symbol: ctx.reserveSymbol,
        }
      : undefined;

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
    <ReceiptCalcContext.Provider value={calc}>
      <EventCard
        avatar={null}
        infoAction={hasSum && stateMarket ? <ReceiptCalcButton /> : undefined}
        iconColumn={iconSlot}
        header={
          // The pointer on the header starts the account reads the open card
          // makes (this transaction's and the previous one's).
          <div className="contents" onPointerOver={prefetch} onFocus={prefetch}>
            <SparkEventHeader
              actionLabel={event.actionLabel}
              ctx={ctx}
              timestamp={event.timestamp}
              txHash={event.txHash}
              blockNumber={event.blockNumber}
              eventNumber={eventNumber}
              externalBy={extBy ?? undefined}
              wallet={event.wallet}
              flows={event.flows}
              feeOf={feeOf}
            />
          </div>
        }
        detail={
          <SparkEventDetail
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            wallet={event.wallet}
            market={stateMarket}
            reserveAddress={reserveAddress}
            previous={previous}
            eventId={event.id}
            eventTs={event.timestamp}
            notesSlot={notesSlot}
          />
        }
        detailLabel="Position state"
        explainer={
          <>
            <div ref={setNotesSlot} className="mb-2 empty:hidden" />
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
          </>
        }
        explainerLabel="Plain English"
        explainerTeaser={sparkExplainerTeaser(ctx, coords, { owner: event.wallet, siblings })}
        txHash={event.txHash}
        learnMore={<LearnMore inline content={sparkLearnMoreContent(feeOf ?? ctx)} />}
        persistKey={`spark:${event.id}`}
      />
    </ReceiptCalcContext.Provider>
  );
}
