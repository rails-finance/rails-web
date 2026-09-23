"use client";

// Moonwell event header — adapter onto the shared ChainTruthRow grammar. Maps
// the signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Router-proxied mints/redeems carry a NEUTRAL "via 0x…" party chip
// (routing, not a third-party verdict — the owner initiated it); genuinely
// external actions (someone else repaid) get the pink external-actor chip.

import type { AssetFlow, MoonwellContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  assetsDeltaProv,
  transferAmountProv,
  seizeTokensProv,
  liqDebtRepaidProv,
  routerProxiedProv,
  externalActorProv,
} from "@/lib/moonwell/event-provenance";
import { useMoonwellCoords, useMoonwellDeployment } from "@/lib/moonwell/deployment-context";

export interface MoonwellEventHeaderProps {
  actionLabel: string;
  ctx: MoonwellContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's own movements, read for each delta's contract. Unlike the
   *  spine — where an mToken row wears the underlying's mark and the lookup has
   *  to key on that override — a header delta draws its mark under its OWN
   *  symbol, so an mToken row asks the flows about the mToken and an underlying
   *  row asks about the underlying. The address has to identify whatever the
   *  chip is resolving, and here those are the same thing. */
  flows?: AssetFlow[];
}

export function MoonwellEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: MoonwellEventHeaderProps) {
  const dep = useMoonwellDeployment();
  const coords = useMoonwellCoords({ market: ctx.market, symbol: ctx.marketSymbol, txHash, blockNumber, wallet });
  const mSym = coords.marketLabel ?? `m${ctx.marketSymbol}`;
  const deltas: ChainTruthDelta[] = [];

  if (ctx.eventType === "liquidation") {
    const covered = Number(ctx.assetsDelta ?? "0") || 0;
    if (covered !== 0)
      deltas.push({
        value: covered,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(flows, ctx.marketSymbol),
        prov: liqDebtRepaidProv(ctx.marketSymbol, coords),
      });
    const seized = Number(ctx.seizeTokens ?? "0") || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collMSym = ctx.collateralMarket
        ? dep.market(ctx.collateralMarket, ctx.collateralSymbol).mSymbol
        : `m${ctx.collateralSymbol}`;
      deltas.push({
        value: -seized,
        symbol: collMSym,
        address: soleFlowAddress(flows, collMSym),
        prov: seizeTokensProv(collMSym, coords),
      });
    }
  } else if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") {
    const d = Number(ctx.mTokensDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: mSym,
        address: soleFlowAddress(flows, mSym),
        prov: transferAmountProv(mSym, ctx.eventType === "transfer_in" ? "in" : "out", coords),
      });
  } else {
    const d = Number(ctx.assetsDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(flows, ctx.marketSymbol),
        prov: assetsDeltaProv(ctx.marketSymbol, ctx.eventType, coords, ctx.raw?.amount),
      });
  }

  // Party chips: the transfer counterparty and the WETH Router are NEUTRAL
  // parties of the event itself; only a true external action is a verdict.
  const party =
    ctx.eventType === "transfer_in" && ctx.counterparty
      ? {
          prefix: "from",
          address: ctx.counterparty,
          prov: transferAmountProv(mSym, "in", coords),
          ens: true,
        }
      : ctx.eventType === "transfer_out" && ctx.counterparty
        ? {
            prefix: "to",
            address: ctx.counterparty,
            prov: transferAmountProv(mSym, "out", coords),
            ens: true,
          }
        : ctx.routerProxied && wallet && (ctx.eventType === "mint" || ctx.eventType === "redeem")
          ? {
              prefix: "via",
              address: ctx.caller ?? "",
              prov: routerProxiedProv({ eventType: ctx.eventType, owner: wallet }, coords),
            }
          : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: ctx.eventType === "liquidation",
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
