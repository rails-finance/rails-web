"use client";

// An Aave V3 event's card (Ethereum, Base, Seamless) on the shared shell's
// slots (rails-ops reference/shared-event-card-spec.md §3, §4; ui-jobs 309
// step 6): the spine, the head (aave-v3-ct-event-header.tsx), the cells, notes
// and prices of T2 (aave-v3-ct-event-detail.tsx), the explanation and the
// Learn-More "?".

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { EventCard, type EventCardSlots } from "@/components/shared/event-card";

import type { SpineColumnProps } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { type V3Coords } from "@/lib/aave-v3/event-provenance";
import { aaveV3ExplainerTeaser } from "@/lib/aave-v3/explainer-clauses";
import { aaveV3CtLabel, isAaveV3LossRow, useAaveV3HeadSpec } from "./aave-v3-ct-event-header";
import { useAaveV3EventBody } from "./aave-v3-ct-event-detail";
import { AaveFamilyLedgers } from "./aave-family-cells";
import { AaveV3EventExplainer, aaveV3LearnMoreContent } from "./aave-v3-event-explainer";
import { useCallback, useState } from "react";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { prefetchAaveV3PositionState } from "@/hooks/useAaveV3PositionState";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { v3Protocol } from "@/lib/aave-v3/protocol-name";
import { feeLiquidation, liquidationFee } from "@/lib/aave-v3/liquidation-fee";
import type { AaveV3Neighbours, AaveV3TimelineEvent } from "@/lib/aave-v3/event-neighbours";

export interface AaveV3CtEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };
  isLast?: boolean;
  eventNumber?: number;
  /** The served market key (core / prime / etherfi, or "base"). Its presence is
   *  what reads the position state when the card opens; Seamless leaves it
   *  unset and keeps the replayed principal line (rails-ops TO-DO-ui-jobs §19). */
  market?: string;
  /** The rows of this event's transaction, this one included (a liquidation
   *  and its fee transfer to the treasury share one). */
  siblings?: AaveV3TimelineEvent[];
  /** The transaction before this one on the timeline, whose after-state is
   *  where this event's before-state started. */
  previous?: AaveV3Neighbours["previous"];
}

// direction "right" = token moves toward the protocol (deposit / repay),
// "left" = toward the wallet (withdraw / borrow). A transfer is neither — the
// aToken changed hands, nothing entered or left the Pool — so it has no entry
// here: the row draws the reserve with the custody badge and no flank, and
// the header carries the amount and the counterparty.
// A swap is neither too: both legs stayed in the position, so its node wears the
// swap glyph with no flank (rails-ops TO-DO-ui-jobs §15, D1). A withdraw and swap
// is the exception: its value left the position, so it draws the withdrawn
// amount on the left flank, the reserve wearing the swap badge (D3).
const DIRECTION: Record<
  Exclude<AaveV3Context["eventType"], "transfer_in" | "transfer_out" | "swap" | "emode">,
  "right" | "left"
> = {
  supply: "right",
  withdraw: "left",
  borrow: "left",
  repay: "right",
  liquidation: "left",
  // A write-off is a debt decrease from the borrower's side, the same axis
  // movement as a repay without the repayment. Stated for the axis it moves
  // on; the row itself wears the warning glyph and no flank, like a
  // liquidation, so this entry is never drawn today.
  bad_debt_written_off: "right",
};

export function AaveV3CtEventCard({ event, isLast, eventNumber, market, siblings, previous }: AaveV3CtEventCardProps) {
  const ctx = event.context.data;
  const chainId = useChainId();
  // Pointer-over or focus of the row starts the position reads the open card
  // makes (this transaction's and the previous one's), so the state is
  // usually in hand by the time the card opens.
  const prefetch = () => {
    if (!market) return;
    const wallet = event.wallet;
    const feeRow = !!feeLiquidation(ctx, siblings, chainId);
    if (feeRow) return;
    prefetchAaveV3PositionState({ wallet, market, block: event.blockNumber, txHash: event.txHash });
    prefetchAaveV3PositionState({ wallet, market, block: previous?.blockNumber, txHash: previous?.txHash });
  };
  // A transfer to the Aave treasury in a liquidation's transaction is that
  // liquidation's protocol fee (lib/aave-v3/liquidation-fee.ts).
  const feeOf = feeLiquidation(ctx, siblings, chainId);
  const fee = liquidationFee(ctx, siblings, chainId);
  // A loss row: the liquidation, or the write-off of the debt it could not
  // cover. Both draw the critical warning glyph on the dotted (passive) spine
  // and hand the amount to the header, which keeps it under `critical`.
  const isLoss = isAaveV3LossRow(ctx);
  const mag = Math.abs(Number(ctx.amount ?? "0")) || 0;
  // Third-party action: the owner neither signed the tx nor made the Pool
  // call. Passive events ride the dotted spine; the pink external-party glyph
  // (the V2 delegate tint) replaces the token flow, and the header keeps the
  // moved amount plus the "by 0x…" chip.
  // A swap's spine is solid: the owner signed the order, whoever relayed it.
  const isSwap = ctx.eventType === "swap";
  const isWithdrawSwap = isSwap && ctx.swap?.kind === "withdraw_and_swap";
  const isSupplySwap = isSwap && ctx.swap?.kind === "supply_from_swap";
  // A swap with one position row draws that row on the flow, wearing the swap
  // badge: withdrawn on the left flank, supplied from a swap on the right (D6).
  const isFlowSwap = isWithdrawSwap || isSupplySwap;
  const extBy = isSwap ? null : externalActor(ctx, event.wallet);

  const coords: V3Coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    chainId,
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  const kind = ctx.eventType;
  const isTransfer = kind === "transfer_in" || kind === "transfer_out";

  // The icon chip resolves a mark from an ADDRESS, and given only a symbol it
  // has to find one in the hand-kept house table. Aave V3's reserves are a
  // curated roster the table already names, so this is belt-and-braces here
  // rather than a repair — but the reserve's contract is sitting in the event's
  // own flows, and taking it from there costs nothing and stops the chip
  // depending on a list someone has to maintain. soleFlowAddress answers only
  // when exactly one flow claims the symbol, so a transaction that touched two
  // reserves sharing a symbol resolves to nothing rather than to the wrong one.
  //
  // A transfer is a custody move: the reserve's icon wears the paper-plane
  // badge and neither flank is drawn — the two flanks are "out to the wallet"
  // and "into the protocol", and a transfer to another account is neither. The
  // header states the amount and the to/from counterparty.
  const tokens =
    isLoss || (isSwap && !isFlowSwap) || mag === 0
      ? undefined
      : isFlowSwap
        ? [
            {
              symbol: ctx.reserveSymbol ?? "?",
              address: soleFlowAddress(event.flows, ctx.reserveSymbol),
              direction: isSupplySwap ? ("right" as const) : ("left" as const),
              value: mag,
              badge: "swap" as const,
            },
          ]
        : isTransfer
          ? [
              {
                symbol: ctx.reserveSymbol ?? "?",
                address: soleFlowAddress(event.flows, ctx.reserveSymbol),
                badge: "send" as const,
              },
            ]
          : [
              {
                symbol: ctx.reserveSymbol ?? "?",
                address: soleFlowAddress(event.flows, ctx.reserveSymbol),
                direction: DIRECTION[kind as keyof typeof DIRECTION],
                value: mag,
              },
            ];

  // A swap that stayed in the position stacks its legs beside the node, given
  // then received. The glyph takes the axis the legs share.
  const s = ctx.swap;
  const legAxis = (action: string): "supply" | "debt" =>
    action === "repay" || action === "borrow" ? "debt" : "supply";
  const swapAxis = s
    ? legAxis(s.givenAction) === legAxis(s.receivedAction)
      ? legAxis(s.givenAction)
      : ("mixed" as const)
    : undefined;
  const received = Math.abs(Number(s?.receivedAmount ?? "0")) || 0;
  const swapLegs =
    s && isSwap && !isFlowSwap
      ? [
          ...(mag !== 0 && ctx.reserveSymbol
            ? [
                {
                  symbol: ctx.reserveSymbol,
                  address: soleFlowAddress(event.flows, ctx.reserveSymbol),
                  value: mag,
                },
              ]
            : []),
          ...(received !== 0 && s.receivedSymbol
            ? [
                {
                  symbol: s.receivedSymbol,
                  address: s.receivedAsset,
                  value: received,
                },
              ]
            : []),
        ]
      : undefined;

  const spine: SpineColumnProps = isLoss
    ? { icon: "warning", warningTone: "critical", isLast: !!isLast }
    : isSwap && !isFlowSwap
      ? { icon: "swap", swapLegs, swapAxis, isLast: !!isLast }
      : { tokens, externalParty: !!extBy, isLast: !!isLast };

  const head = useAaveV3HeadSpec({
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    externalBy: extBy ?? undefined,
    wallet: event.wallet,
    flows: event.flows,
    feeOf,
  });
  // The reads start when the card first opens.
  const [active, setActive] = useState(false);
  const onOpen = useCallback(() => setActive(true), []);
  const body = useAaveV3EventBody({
    active,
    ctx,
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    wallet: event.wallet,
    market,
    feeOf,
    fee,
    previous,
    // A liquidation fee's transfer states the liquidation's account: no ledger.
    eventId: feeOf ? undefined : event.id,
    eventTs: event.timestamp,
  });
  // The read lane (a market, and not a fee's row) opens its side cells into
  // their ledgers once the read has landed; Seamless has no read.
  const readLane = !!market && !feeOf;

  const slots: EventCardSlots = {
    event: {
      id: event.id,
      family: "aave-v3",
      txHash: event.txHash,
      blockNumber: event.blockNumber,
      timestamp: event.timestamp,
      number: eventNumber,
    },
    spine,
    head,
    caption: aaveV3CtLabel(ctx, !!feeOf, chainId),
    actor: {
      by: extBy ?? undefined,
      custody:
        ctx.counterparty && isTransfer
          ? { dir: kind === "transfer_out" ? "to" : "from", address: ctx.counterparty }
          : undefined,
    },
    cells: body.cells,
    cellsData: body.cellsData,
    ledgers: readLane
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
            : "No position read on this lane: the cells state the event's balances.",
        },
    notes: body.notes,
    // The index carries no gas for the Aave family's rows and the position read
    // reads none, so the row states no owner-paid gas.
    price: { gas: null, prices: body.prices },
    explainer: {
      body: (
        <>
          {body.rateNote}
          <AaveV3EventExplainer
            ctx={ctx}
            txHash={event.txHash}
            blockNumber={event.blockNumber}
            owner={event.wallet}
            market={market}
            siblings={siblings}
            previous={previous}
            timestamp={event.timestamp}
            skipLead
          />
        </>
      ),
      first: aaveV3ExplainerTeaser(ctx, coords, { owner: event.wallet, siblings }) ?? undefined,
    },
    learnMore: <LearnMore inline content={aaveV3LearnMoreContent(feeOf ?? ctx, v3Protocol(coords.pool))} />,
    onIntent: prefetch,
    onOpen,
  };

  return <EventCard slots={slots} avatar={null} />;
}
