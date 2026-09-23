"use client";

// Dolomite event header — adapter onto the shared ChainTruthRow grammar.
// Maps this leg's emitted deltaWei into the shared row spec; traces via
// <Prov>. Genuinely external actions get the pink external-actor chip; the
// liquidation legs carry NEUTRAL party chips whose prefixes say what happened
// ("liquidated by" / "seized by" / "seized from") — the balance was TAKEN,
// and the copy never reads as an act the borrower performed.

import type { AssetFlow, DolomiteContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  movedDeltaProv,
  liquidationDebtProv,
  liquidationLegProv,
  transferLegProv,
  externalActorProv,
  type DolomiteCoords,
} from "@/lib/dolomite/event-provenance";

export interface DolomiteEventHeaderProps {
  actionLabel: string;
  ctx: DolomiteContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict). */
  externalBy?: string;
  /** The account owner, for the receipt's owner row. */
  wallet?: string;
  /** The event's own movements, read for the market asset's contract address.
   *  A Dolomite market is identified by a numeric id whose symbol is resolved
   *  separately, and the chip cannot ask a CDN about a symbol — it needs the
   *  ERC-20. The leg's flow states it, which beats looking it up in a table
   *  that has to be edited every time Dolomite lists a market. */
  flows?: AssetFlow[];
}

export function DolomiteEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: DolomiteEventHeaderProps) {
  const coords: DolomiteCoords = {
    txHash,
    blockNumber,
    owner: wallet,
    marketId: ctx.marketId,
  };
  const sym = ctx.marketSymbol;
  const raw = ctx.raw?.weiDelta;

  const deltas: ChainTruthDelta[] = [];
  const d = Number(ctx.weiDelta ?? "0") || 0;
  if (d !== 0)
    deltas.push({
      value: d,
      symbol: sym,
      address: soleFlowAddress(flows, sym),
      prov: movedDeltaProv(ctx.eventType, sym, coords, raw),
    });

  // Party chips. Transfer legs name the other Account.Info neutrally; the
  // liquidation legs name theirs with prefixes that say the balance was
  // TAKEN. A liquidation's indexed owner is the LIQUIDATOR — the borrower is
  // the unindexed one, and the prefixes keep that straight on both sides.
  const party =
    (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") && ctx.counterparty
      ? {
          prefix: ctx.eventType === "transfer_in" ? "from" : "to",
          address: ctx.counterparty,
          prov: transferLegProv(sym, ctx.eventType === "transfer_in" ? "in" : "out", coords),
        }
      : ctx.eventType === "liquidation" && ctx.liquidator
        ? { prefix: "by", address: ctx.liquidator, prov: liquidationDebtProv(sym, coords, raw) }
        : ctx.eventType === "seize_out" && ctx.liquidator
          ? { prefix: "seized by", address: ctx.liquidator, prov: liquidationLegProv(sym, "seize_out", coords, raw) }
          : ctx.eventType === "seize_in" && ctx.counterparty
            ? {
                prefix: "seized from",
                address: ctx.counterparty,
                prov: liquidationLegProv(sym, "seize_in", coords, raw),
              }
            : ctx.eventType === "liquidation_payout" && ctx.counterparty
              ? {
                  prefix: "repaid for",
                  address: ctx.counterparty,
                  prov: liquidationLegProv(sym, "liquidation_payout", coords, raw),
                }
              : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: ctx.eventType === "liquidation" || ctx.eventType === "seize_out",
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
