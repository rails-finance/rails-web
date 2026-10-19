"use client";

// Fluid event header — adapter onto the shared ChainTruthRow grammar. Maps the
// signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Operate composites carry one delta per moved leg (LogOperate's own
// signed params); liquidation rows carry the per-position impact — the
// difference of the row's settled boundary reads (LogLiquidate names no
// position) — with the liquidator as a NEUTRAL party chip. Genuinely external
// operates (initiator and tx sender both ≠ owner) get the pink external-actor
// chip.
//
// The timeline's head (mode "row", rails-ops decision 0045) is words
// (`fluidT1Words`, lib/fluid/head-words.ts): the past-participle kind, an
// operate's legs in leg order, an ownership transfer's new owner or its round
// trip as the clause, the liquidator's and the "by" chips. The spine carries
// the figures. The event page's card (mode "title") keeps the signed amounts.

import type { AssetFlow, FluidContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { PartyChip, type ChainTruthDelta, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { fluidT1Words } from "@/lib/fluid/head-words";
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
  /** "row": the timeline's head, in words; "title" (default): the event
   *  page's card, with the figures. */
  mode?: "row" | "title";
  /** The position's Open row, and an ownership hop that came back within the
   *  transaction: what the row's words name. */
  opened?: boolean;
  roundTrip?: boolean;
}

/** T1's head row spec (the card's `head` slot). */
export function useFluidHeadSpec({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
  mode = "title",
  opened,
  roundTrip,
}: FluidEventHeaderProps): ChainTruthRowSpec {
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

  const externalActor =
    externalBy && wallet && ctx.txFrom && ctx.initiator
      ? {
          address: externalBy,
          prov: externalActorProv(
            { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, initiator: ctx.initiator },
            coords,
          ),
        }
      : undefined;

  if (mode === "row") {
    const words = fluidT1Words(ctx, actionLabel, { opened, roundTrip });
    const transfer = ctx.eventType === "transfer";
    return {
      label: words.kind,
      critical: isLiq,
      deltas: [],
      // An ownership transfer's new owner is the clause after
      // "Transferred"; a round trip states that instead.
      clauses: words.clause
        ? [words.clause]
        : transfer && party
          ? [<PartyChip key="party" party={party} />]
          : undefined,
      party: transfer ? undefined : party,
      externalActor,
    };
  }

  return {
    label: actionLabel,
    critical: isLiq,
    deltas,
    externalActor,
    party,
  };
}
