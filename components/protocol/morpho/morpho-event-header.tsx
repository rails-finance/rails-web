"use client";

// Morpho event header (chain-state tier) — adapter onto the shared ChainTruthRow
// grammar. Maps the single signed amount this event moved (loan or collateral
// side) into the shared row spec; traces via <Prov>. No health factor, no USD —
// those are layers, absent from the baseline.

import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import { assetsDeltaProv, externalActorProv, type MorphoCoords } from "@/lib/morpho/event-provenance";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";

export interface MorphoEventHeaderProps {
  actionLabel: string;
  ctx: MorphoContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own token movements. Read only to name the moved token's
   *  ADDRESS for the icon chip: Morpho is permissionless, so the house symbol
   *  table cannot name most of what lists here and a symbol-only chip draws
   *  the initial letter. The flow carries the contract the transfer touched. */
  flows?: AssetFlow[];
}

export function MorphoEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: MorphoEventHeaderProps) {
  const coords: MorphoCoords = {
    txHash,
    blockNumber,
    marketId: ctx.marketId,
    owner: undefined,
    chainId: useChainId(),
    source: useCaptureSource(),
  };
  const sym = ctx.side === "collateral" ? ctx.collateralSymbol : ctx.loanSymbol;
  const delta = Number(ctx.assetsDelta) || 0;

  const deltas: ChainTruthDelta[] =
    delta === 0
      ? []
      : [
          {
            value: delta,
            symbol: sym,
            address: soleFlowAddress(flows, sym),
            prov: assetsDeltaProv(sym, ctx.side, coords, ctx.eventType),
          },
        ];

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: ctx.eventType === "liquidation",
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
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
