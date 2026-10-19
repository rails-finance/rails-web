"use client";

// Morpho event header (chain-state tier): the card's `head` slot, drawn by the
// shared ChainTruthRow.
//
// The timeline's head (mode "row", rails-ops decision 0045) is words: the
// past-participle kind (`morphoT1Kind`, lib/morpho/head-words.ts) and the pink
// "by" chip where another account acted. The spine carries the figures.
//
// The event page's card (mode "title") maps the single signed amount this
// event moved (loan or collateral side) into the shared row spec; traces via
// <Prov>. No health factor, no USD: those are layers, absent from the
// baseline.

import type { AssetFlow, MorphoContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  assetsDeltaProv,
  externalActorProv,
  liqClearedValueProv,
  type MorphoCoords,
} from "@/lib/morpho/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { useChainId } from "@/lib/shared/chain-context";
import { useCaptureSource } from "@/lib/shared/capture-source";
import { morphoT1Kind } from "@/lib/morpho/head-words";

export interface MorphoEventHeaderProps {
  actionLabel: string;
  ctx: MorphoContext;
  txHash?: string;
  blockNumber?: number;
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
  /** "row": the timeline's head, in words; "title" (default): the event
   *  page's card, with the figures. */
  mode?: "row" | "title";
}

/** T1's head row spec (the card's `head` slot). */
export function useMorphoHeadSpec({
  actionLabel,
  ctx,
  txHash,
  blockNumber,
  externalBy,
  wallet,
  flows,
  mode = "title",
}: Omit<MorphoEventHeaderProps, "timestamp" | "eventNumber">): ChainTruthRowSpec {
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
  // A liquidation moves both sides: the collateral seized, and the debt it
  // cleared (the Liquidate log's repaid assets plus any bad debt).
  const cleared = ctx.eventType === "liquidation" ? Number(ctx.loanRepaid) : 0;
  if (Number.isFinite(cleared) && cleared > 0)
    deltas.push({
      value: -cleared,
      symbol: ctx.loanSymbol,
      address: soleFlowAddress(flows, ctx.loanSymbol),
      prov: liqClearedValueProv(ctx.loanSymbol, coords, { amount: formatNumber(cleared) }),
      debtSide: true,
    });

  const externalActor =
    externalBy && wallet && ctx.txFrom && ctx.caller
      ? {
          address: externalBy,
          prov: externalActorProv(
            { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, caller: ctx.caller },
            coords,
          ),
        }
      : undefined;

  if (mode === "row")
    return {
      label: morphoT1Kind(ctx.eventType),
      critical: ctx.eventType === "liquidation",
      deltas: [],
      externalActor,
    };

  return {
    label: actionLabel,
    critical: ctx.eventType === "liquidation",
    deltas,
    externalActor,
  };
}
