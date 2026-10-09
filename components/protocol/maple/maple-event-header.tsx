"use client";

// Maple event header — adapter onto the shared ChainTruthRow grammar. Maps
// the signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Value-bearing events (deposit / withdraw / fill) lead with the
// asset amount; queue and transfer events lead with the share amount. A
// genuinely external action (someone else moved the position) gets the pink
// external-actor chip.

import type { AssetFlow, MapleContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  flankedLegProv,
  sharesLegProv,
  transferAmountProv,
  externalActorProv,
  type MapleCoords,
} from "@/lib/maple/event-provenance";
import { getCcipEscrow } from "@/lib/shared/known-infrastructure";
import { formatWait } from "@/lib/maple/row-times";
import { formatNumber } from "@/lib/utils/format";

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
  /** Queue fills: unix seconds of the request this fill paid, where loaded. */
  requestAt?: number;
}

/** The row's words for a share transfer: what the wallet did with shares. */
export const TRANSFER_LABEL = { transfer_in: "Shares received", transfer_out: "Shares sent" } as const;

/** T1's head row spec (the card's `head` slot). */
export function useMapleHeadSpec({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
  requestAt,
}: MapleEventHeaderProps): ChainTruthRowSpec {
  const coords: MapleCoords = { txHash, blockNumber, pool: ctx.pool, account: wallet };
  const deltas: ChainTruthDelta[] = [];

  // The flanked leg — the same builder + signed-value convention the card's
  // spine echo calls, so the two can never disagree on the sign.
  const flanked = flankedLegProv(ctx, coords);
  // Each amount names its token in words (the phone row has no spine to
  // carry it): a request moves shares, a fill pays the asset. One rounding
  // rule, Polaris's: the row, the spine, the opened grid and the card state
  // an amount in full to three decimals.
  if (flanked)
    deltas.push({
      ...flanked,
      address: soleFlowAddress(flows, flanked.symbol),
      suffix: flanked.symbol,
      display: formatNumber(Math.abs(flanked.value)),
    });

  // The share leg rides beside the asset leg on deposits/withdraws (mint/burn).
  // The card draws it as the spine's second row from this same builder, so the
  // hand-off at ≥sm has somewhere to land.
  const shares = sharesLegProv(ctx, coords);
  if (shares)
    deltas.push({
      ...shares,
      address: soleFlowAddress(flows, shares.symbol),
      suffix: shares.symbol,
      display: formatNumber(Math.abs(shares.value)),
    });

  const isTransfer = ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out";
  // Which pool the row is in (a wallet's two pools interleave), then what
  // the amount is and where it went.
  const what =
    ctx.eventType === "request"
      ? "shares moved into the queue"
      : ctx.eventType === "request_fill"
        ? requestAt != null && timestamp >= requestAt
          ? `paid to the wallet, ${formatWait(timestamp - requestAt)} after the request`
          : "paid to the wallet"
        : undefined;
  const note = what ? `${ctx.assetSymbol} pool · ${what}` : `${ctx.assetSymbol} pool`;

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

  return {
    label: isTransfer ? TRANSFER_LABEL[ctx.eventType as keyof typeof TRANSFER_LABEL] : actionLabel,
    // A transfer is a custody row: `Shares received 400 ◎ from 0x…`, the
    // verb kept before the amount.
    custody: isTransfer,
    custodyLabel: isTransfer,
    // The label says the direction; a sign read as a loss on a fill.
    unsignedDeltas: true,
    deltas,
    note,
    externalActor:
      externalBy && wallet && ctx.txFrom && ctx.caller
        ? {
            address: externalBy,
            prov: externalActorProv(
              { eventType: ctx.eventType, owner: wallet, txFrom: ctx.txFrom, caller: ctx.caller },
              coords,
            ),
            tip: isTransfer
              ? "“by” is the address that sent the transaction; “from” is the wallet the shares came from."
              : undefined,
          }
        : undefined,
    party,
  };
}
