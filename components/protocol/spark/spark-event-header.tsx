"use client";

// SparkLend event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. Maps the signed amount(s) this event moved into the shared row spec;
// traces via <Prov>. No health factor, no USD — those are layers, absent here.

import type { AssetFlow, SparkContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  assetsDeltaProv,
  seizedCollateralProv,
  debtRepaidProv,
  externalActorProv,
  transferDeltaProv,
  transferCounterpartyProv,
  type SparkCoords,
} from "@/lib/spark/event-provenance";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { protocolIconSrc } from "@/lib/shared/protocols";

export interface SparkEventHeaderProps {
  actionLabel: string;
  ctx: SparkContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's movements, consulted only for the moved reserve's contract.
   *  SparkContext names its reserves by symbol, and a symbol is not an
   *  identifier — the chip has to reach an address before it can ask either
   *  icon CDN anything, and the house table is the wrong place to ask when the
   *  event itself recorded the contract that moved. */
  flows?: AssetFlow[];
}

export function SparkEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: SparkEventHeaderProps) {
  const coords: SparkCoords = { txHash, blockNumber };
  const deltas: ChainTruthDelta[] = [];

  if (ctx.eventType === "liquidation") {
    const coll = Number(ctx.assetsDelta) || 0;
    if (coll !== 0 && ctx.collateralSymbol)
      deltas.push({
        value: coll,
        symbol: ctx.collateralSymbol,
        address: soleFlowAddress(flows, ctx.collateralSymbol),
        prov: seizedCollateralProv(ctx.collateralSymbol, coords),
      });
    const debt = Number(ctx.debtDelta ?? "0") || 0;
    if (debt !== 0)
      deltas.push({
        value: debt,
        symbol: ctx.reserveSymbol,
        address: soleFlowAddress(flows, ctx.reserveSymbol),
        prov: debtRepaidProv(ctx.reserveSymbol, coords),
      });
  } else {
    const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
    const d = Number(ctx.assetsDelta) || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: ctx.reserveSymbol,
        address: soleFlowAddress(flows, ctx.reserveSymbol),
        prov: isTransfer
          ? transferDeltaProv(ctx.reserveSymbol, ctx.eventType === "transfer_in" ? "in" : "out", coords)
          : assetsDeltaProv(ctx.reserveSymbol, ctx.side, coords),
      });
  }

  // A transfer's counterparty is a named party of the event itself, not a
  // verdict about who acted — the neutral to/from chip, never the pink. A known
  // protocol contract (lib/shared/known-infrastructure.ts) is named with its
  // mark; any other address by ENS where it has a reverse record.
  const transferOut = ctx.eventType === "transfer_out";
  const isTransferRow = transferOut || ctx.eventType === "transfer_in";
  const named = getProtocolContract(ctx.counterparty, MAINNET_CHAIN_ID);
  const party =
    ctx.counterparty != null
      ? {
          prefix: transferOut ? "to" : "from",
          address: ctx.counterparty,
          name: named?.name,
          icon: named?.protocolIcon ? protocolIconSrc(named.protocolIcon) : undefined,
          prov: transferCounterpartyProv(transferOut ? "out" : "in", coords, ctx.counterparty),
          ens: true,
        }
      : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: ctx.eventType === "liquidation",
        // A transfer is a custody row: `400 ◎ to 0x…` — the spine's paper
        // plane and the chip's to/from are the verb (see ChainTruthRowSpec).
        custody: isTransferRow,
        deltas,
        party,
        externalActor:
          externalBy && wallet && ctx.txFrom && ctx.poolCaller
            ? {
                address: externalBy,
                prov: externalActorProv(
                  { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, poolCaller: ctx.poolCaller },
                  coords,
                ),
              }
            : undefined,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
