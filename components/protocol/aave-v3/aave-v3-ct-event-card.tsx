"use client";

// Composer: wires the Aave V3 ON-CHAIN VALUES header / detail / explainer into the
// universal EventCard shell (chain-replayed values carry the chain-state
// baseline; the plain-English explainer rides its own second-tier slot).

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV3Context } from "@/lib/shared/types/protocols/aave-v3";
import { EventCard } from "@/components/shared/event-card";
import { chainTruthDeltaValue } from "@/components/shared/chain-truth-event";
import { SpineColumn } from "@/components/shared/spine-column";
import { externalActor } from "@/lib/shared/external-actor";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { assetsDeltaProv, swapLegNet, swapLegProv, swapLegSign, type V3Coords } from "@/lib/aave-v3/event-provenance";
import { aaveV3ExplainerTeaser } from "@/lib/aave-v3/explainer-clauses";
import { AaveV3CtEventHeader, isAaveV3LossRow, signedAmount } from "./aave-v3-ct-event-header";
import { AaveV3CtEventDetail } from "./aave-v3-ct-event-detail";
import { AaveV3EventExplainer, aaveV3LearnMoreContent } from "./aave-v3-event-explainer";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { useV3Pool } from "@/lib/aave-v3/pool-context";
import { v3Protocol } from "@/lib/aave-v3/protocol-name";

export interface AaveV3CtEventCardProps {
  event: BaseActivityEvent & { context: { protocol: "aave-v3"; data: AaveV3Context } };
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** The served market key (core / prime / etherfi). The Ethereum explorer sets
   *  it, and its presence is what reads the position state when the card opens;
   *  Base and Seamless leave it unset and keep the replayed principal line
   *  (rails-ops TO-DO-ui-jobs §19). */
  market?: string;
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
  Exclude<AaveV3Context["eventType"], "transfer_in" | "transfer_out" | "swap">,
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

export function AaveV3CtEventCard({ event, isFirst, isLast, eventNumber, market }: AaveV3CtEventCardProps) {
  const ctx = event.context.data;
  const isLiq = ctx.eventType === "liquidation";
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

  // Echo the spine flank value into the header's registered reserve-delta
  // receipt so the picker can target it: same prov builder + args, same
  // signed-string helper, same symbol the header uses. Liquidations don't
  // draw a token flank (the warning icon replaces it), so no echo there.
  const coords: V3Coords = {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    chainId: useChainId(),
    source: useCaptureSource(),
    pool: useV3Pool(),
  };
  const side = ctx.eventType === "supply" || ctx.eventType === "withdraw" ? "supply" : "debt";
  // A transfer draws no flank (see `tokens` below), so it echoes nothing.
  const kind = ctx.eventType;
  const isTransfer = kind === "transfer_in" || kind === "transfer_out";
  const signedDelta = signedAmount(ctx);
  const spineProv =
    !isLoss && !isTransfer && !isSwap && signedDelta !== 0 && ctx.reserveSymbol
      ? {
          info: assetsDeltaProv(ctx.reserveSymbol, side, coords, ctx.raw?.amount, ctx.origin?.amount),
          value: chainTruthDeltaValue(signedDelta, false),
          symbol: ctx.reserveSymbol,
        }
      : undefined;

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
              prov: ctx.reserveSymbol
                ? {
                    info: swapLegProv(
                      ctx.reserveSymbol,
                      isSupplySwap ? "transfer_in" : "transfer_out",
                      coords,
                      ctx.raw?.amount,
                      ctx.origin?.amount,
                      isSupplySwap ? "supply_from_swap" : "withdraw_and_swap",
                      undefined,
                      ctx.swap,
                    ),
                    value: chainTruthDeltaValue(isSupplySwap ? mag : -mag, false),
                    symbol: ctx.reserveSymbol,
                  }
                : undefined,
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
                prov: spineProv,
              },
            ];

  // A swap that stayed in the position stacks its legs beside the node, given
  // then received, each echoing the header's leg receipt (same builder, same
  // arguments, same signed value). The glyph takes the axis the legs share.
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
                  prov: {
                    info: swapLegProv(
                      ctx.reserveSymbol,
                      s.givenAction,
                      coords,
                      ctx.raw?.amount,
                      ctx.origin?.amount,
                      s.kind,
                      swapLegNet(s, "given"),
                      s,
                    ),
                    value: chainTruthDeltaValue(swapLegSign(s.givenAction) * mag, false),
                    symbol: ctx.reserveSymbol,
                  },
                },
              ]
            : []),
          ...(received !== 0 && s.receivedSymbol
            ? [
                {
                  symbol: s.receivedSymbol,
                  address: s.receivedAsset,
                  value: received,
                  prov: {
                    info: swapLegProv(
                      s.receivedSymbol,
                      s.receivedAction,
                      coords,
                      s.raw.receivedAmount,
                      s.receivedOrigin,
                      s.kind,
                      swapLegNet(s, "received"),
                      s,
                    ),
                    value: chainTruthDeltaValue(swapLegSign(s.receivedAction, s.kind) * received, false),
                    symbol: s.receivedSymbol,
                  },
                },
              ]
            : []),
        ]
      : undefined;

  const iconSlot = isLoss ? (
    <SpineColumn
      icon="warning"
      warningTone="critical"
      warningLabel={isLiq ? "Liquidation" : "Written off"}
      spine="dotted"
      isFirst={isFirst}
      isLast={!!isLast}
    />
  ) : isSwap && !isFlowSwap ? (
    <SpineColumn
      icon="swap"
      swapLegs={swapLegs}
      swapAxis={swapAxis}
      spine="solid"
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
        <AaveV3CtEventHeader
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
      detail={
        <AaveV3CtEventDetail
          ctx={ctx}
          txHash={event.txHash}
          blockNumber={event.blockNumber}
          wallet={event.wallet}
          market={market}
        />
      }
      detailLabel="Position state"
      explainer={<AaveV3EventExplainer ctx={ctx} txHash={event.txHash} blockNumber={event.blockNumber} skipLead />}
      explainerLabel="Plain English"
      explainerTeaser={aaveV3ExplainerTeaser(ctx, coords)}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={aaveV3LearnMoreContent(ctx, v3Protocol(coords.pool))} />}
      persistKey={`aave-v3:${event.id}`}
    />
  );
}
