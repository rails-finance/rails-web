"use client";

// Moonwell event header — adapter onto the shared ChainTruthRow grammar. Maps
// the signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Router-proxied mints/redeems carry a NEUTRAL "via 0x…" party chip
// (routing, not a third-party verdict — the owner initiated it); genuinely
// external actions (someone else repaid) get the pink external-actor chip.

import type { AssetFlow, MoonwellContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
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
  txHash?: string;
  blockNumber?: number;
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

export function useMoonwellHeadSpec({
  actionLabel,
  ctx,
  txHash,
  blockNumber,
  externalBy,
  wallet,
  flows,
}: MoonwellEventHeaderProps): ChainTruthRowSpec {
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
        debtSide: true,
      });
    const seized = Number(ctx.seizeTokens ?? "0") || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collMSym = ctx.collateralMarket
        ? dep.market(ctx.collateralMarket, ctx.collateralSymbol).mSymbol
        : `m${ctx.collateralSymbol}`;
      deltas.push({
        value: -seized,
        symbol: collMSym,
        // No contract address for an mToken: the icon CDNs hold none, so the
        // chip resolves the mark from the symbol.
        prov: seizeTokensProv(collMSym, coords),
        // An mToken count, named so it does not read as the underlying.
        suffix: collMSym,
      });
    }
  } else if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") {
    const d = Number(ctx.mTokensDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: mSym,
        prov: transferAmountProv(mSym, ctx.eventType === "transfer_in" ? "in" : "out", coords),
        suffix: mSym,
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
            // The protocol's share of a seizure goes to the market itself.
            prefix:
              coords.mtoken != null && ctx.counterparty === coords.mtoken.toLowerCase()
                ? `to the ${mSym} market`
                : // A seizure's transfer to the liquidator: the contract that
                  // called the market is the one receiving, in a transaction
                  // someone other than the owner sent.
                  wallet &&
                    ctx.caller &&
                    ctx.caller.toLowerCase() === ctx.counterparty.toLowerCase() &&
                    ctx.txFrom &&
                    ctx.txFrom.toLowerCase() !== wallet.toLowerCase()
                  ? "to the liquidator"
                  : "to",
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

  return {
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
            // A contract made the repayment for the wallet that sent the
            // transaction (a liquidation bot's contract, say): both named.
            ...(ctx.eventType === "repay" && ctx.caller.toLowerCase() !== ctx.txFrom.toLowerCase()
              ? {
                  prefix: "sent by",
                  tip: (
                    <>
                      {ctx.txFrom.slice(0, 6)}…{ctx.txFrom.slice(-4)} sent the transaction. The contract{" "}
                      {ctx.caller.slice(0, 6)}…{ctx.caller.slice(-4)} it called made the repayment.
                    </>
                  ),
                }
              : {}),
          }
        : undefined,
    party,
  };
}
