"use client";

// Maple event header — adapter onto the shared ChainTruthRow grammar. Maps
// the signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Value-bearing events (deposit / withdraw / fill) lead with the
// asset amount; queue and transfer events lead with the share amount. A
// genuinely external action (someone else moved the position) gets the pink
// external-actor chip.

import type { AssetFlow, MapleContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  flankedLegProv,
  sharesLegProv,
  transferAmountProv,
  externalActorProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";
import { getCcipEscrow } from "@/lib/shared/known-infrastructure";

export interface MapleEventHeaderProps {
  actionLabel: string;
  ctx: MapleContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own movements, read for the contract behind each leg. A pool
   *  share token is minted per pool and was never going to appear in the house
   *  symbol table, so without an address that leg has nothing to draw but a
   *  letter; the underlying is named there too and the same lookup covers both.
   *  Each leg asks about its OWN symbol, which is what keeps the asset and the
   *  share apart in a deposit that moved both. */
  flows?: AssetFlow[];
}

export function MapleEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: MapleEventHeaderProps) {
  const coords: MapleCoords = { txHash, blockNumber, pool: ctx.pool, account: wallet };
  const deltas: ChainTruthDelta[] = [];

  // The flanked leg — the same builder + signed-value convention the card's
  // spine echo calls, so the two can never disagree on the sign.
  const flanked = flankedLegProv(ctx, coords);
  if (flanked) deltas.push({ ...flanked, address: soleFlowAddress(flows, flanked.symbol) });

  // The share leg rides beside the asset leg on deposits/withdraws (mint/burn).
  // The card draws it as the spine's second row from this same builder, so the
  // hand-off at ≥sm has somewhere to land.
  const shares = sharesLegProv(ctx, coords);
  if (shares) deltas.push({ ...shares, address: soleFlowAddress(flows, shares.symbol) });

  // Party chips: a transfer counterparty is a NEUTRAL party of the event
  // itself; only a true external action is a verdict. A known infrastructure
  // counterparty (the CCIP bridge escrow) renders its registry name over the
  // truncated address — the chip's existing `name` seam; unknowns keep the
  // bare address.
  const party =
    ctx.eventType === "transfer_in" && ctx.counterparty
      ? {
          prefix: "from",
          address: ctx.counterparty,
          name: getCcipEscrow(ctx.counterparty)?.name,
          prov: transferAmountProv(ctx.poolSymbol, "in", coords),
          ens: true,
        }
      : ctx.eventType === "transfer_out" && ctx.counterparty
        ? {
            prefix: "to",
            address: ctx.counterparty,
            name: getCcipEscrow(ctx.counterparty)?.name,
            prov: transferAmountProv(ctx.poolSymbol, "out", coords),
            ens: true,
          }
        : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
        // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
        custody: ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out",
        deltas,
        externalActor:
          externalBy && wallet && ctx.txFrom && ctx.caller
            ? {
                address: externalBy,
                prov: externalActorProv(
                  { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, caller: ctx.caller },
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
