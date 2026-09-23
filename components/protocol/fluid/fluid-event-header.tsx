"use client";

// Fluid event header — adapter onto the shared ChainTruthRow grammar. Maps the
// signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Operate composites carry one delta per moved leg (LogOperate's own
// signed params); liquidation rows carry the per-position impact — the
// difference of the row's settled boundary reads (LogLiquidate names no
// position) — with the liquidator as a NEUTRAL party chip. Genuinely external
// operates (initiator and tx sender both ≠ owner) get the pink external-actor
// chip.

import type { AssetFlow, FluidContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  colDeltaProv,
  debtDeltaProv,
  liqImpactProv,
  liquidatorProv,
  ownerProv,
  externalActorProv,
  type FluidCoords,
} from "@/lib/fluid/event-provenance";
import { pairLabel } from "@/lib/fluid/asset-catalog";

export interface FluidEventHeaderProps {
  actionLabel: string;
  ctx: FluidContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner at this event, for the receipt's owner row. */
  wallet?: string;
  /** The event's own movements, read only for each leg's contract address —
   *  what the icon chip needs before it can ask a CDN anything at all. Both
   *  lookups below key on ctx.supplySymbol / ctx.borrowSymbol rather than on
   *  the display strings beside them, because those fall back to "DEX shares",
   *  which names no token: asking the flows about it would be asking about
   *  something that does not exist. Fluid's own timeline currently records its
   *  flows without a token address, so this resolves to nothing today and will
   *  start answering the moment that builder carries one. */
  flows?: AssetFlow[];
}

export function FluidEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: FluidEventHeaderProps) {
  const supplySym = ctx.supplySymbol ?? "DEX shares";
  const borrowSym = ctx.borrowSymbol ?? "DEX shares";
  const supplyAddr = soleFlowAddress(flows, ctx.supplySymbol);
  const borrowAddr = soleFlowAddress(flows, ctx.borrowSymbol);
  const coords: FluidCoords = {
    txHash,
    blockNumber,
    vault: ctx.vault,
    pairLabel: pairLabel(ctx.supplySymbol, ctx.borrowSymbol),
    nftId: ctx.nftId,
    owner: ctx.ownerAt ?? wallet,
  };
  const isLiq = ctx.eventType === "liquidated" || ctx.eventType === "absorbed";
  const deltas: ChainTruthDelta[] = [];

  if (isLiq) {
    // Per-position impact: the difference of the row's own settled boundary
    // reads (before − after per leg) — labelled magnitudes, the label carries
    // the direction.
    const seized = Number(ctx.liqSupplyBefore ?? "0") - Number(ctx.liqSupplyAfter ?? "0");
    const cleared = Number(ctx.liqBorrowBefore ?? "0") - Number(ctx.liqBorrowAfter ?? "0");
    if (Number.isFinite(seized) && seized > 0)
      deltas.push({
        value: seized,
        symbol: supplySym,
        address: supplyAddr,
        label: "Seized",
        tone: "caution",
        prov: liqImpactProv("collateral", supplySym, coords),
      });
    if (Number.isFinite(cleared) && cleared > 0)
      deltas.push({
        value: cleared,
        symbol: borrowSym,
        address: borrowAddr,
        label: "Cleared",
        tone: "caution",
        prov: liqImpactProv("debt", borrowSym, coords),
      });
  } else if (ctx.eventType !== "mint" && ctx.eventType !== "transfer") {
    // Operate: one delta per moved leg — a composite carries both.
    const col = Number(ctx.colDelta ?? "0") || 0;
    if (col !== 0)
      deltas.push({
        value: col,
        symbol: supplySym,
        address: supplyAddr,
        prov: colDeltaProv(supplySym, coords, ctx.raw?.colAmt),
      });
    const debt = Number(ctx.debtDelta ?? "0") || 0;
    if (debt !== 0)
      deltas.push({
        value: debt,
        symbol: borrowSym,
        address: borrowAddr,
        prov: debtDeltaProv(borrowSym, coords, ctx.raw?.debtAmt),
      });
  }

  // Party chips: the liquidator and the NFT move counterparty are NEUTRAL
  // parties of the event itself; only a true external action is a verdict.
  const party =
    ctx.eventType === "liquidated" && ctx.liquidator
      ? { prefix: "by", address: ctx.liquidator, prov: liquidatorProv(coords, ctx.liquidator) }
      : (ctx.eventType === "mint" || ctx.eventType === "transfer") && ctx.transferTo
        ? { prefix: "to", address: ctx.transferTo, prov: ownerProv(coords, ctx.transferTo) }
        : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: isLiq,
        deltas,
        externalActor:
          externalBy && wallet && ctx.txFrom && ctx.initiator
            ? {
                address: externalBy,
                prov: externalActorProv(
                  { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, initiator: ctx.initiator },
                  coords,
                ),
              }
            : undefined,
        party,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
