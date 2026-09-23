"use client";

// Compound V2 event header — adapter onto the shared ChainTruthRow grammar.
// Maps the signed amount(s) this event moved into the shared row spec; traces
// via <Prov>. Genuinely external actions (someone else repaid — including
// Maximillion fronting a cETH repay) get the pink external-actor chip; the
// seizure legs carry NEUTRAL party chips whose prefixes say what happened
// ("seized by" / "seized from") — the collateral was TAKEN, and the copy never
// reads as a send the borrower made.

import type { AssetFlow, CompoundV2Context } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  movedDeltaProv,
  transferAmountProv,
  seizeLegProv,
  seizeTokensProv,
  liqDebtRepaidProv,
  externalActorProv,
  type CompoundV2Coords,
} from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";

export interface CompoundV2EventHeaderProps {
  actionLabel: string;
  ctx: CompoundV2Context;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** Third-party actor (the card's externalActor() verdict) — renders the pink
   *  "by 0x…" chip with the traced receipt. */
  externalBy?: string;
  /** The position owner, for the receipt's owner row (required with externalBy). */
  wallet?: string;
  /** The event's flows, consulted for the contract behind each delta's symbol.
   *  Every lookup below is keyed on the symbol the delta DISPLAYS, never on the
   *  receipt's catalog symbol: the address has to identify the same asset the
   *  mark is drawn for, and on the cToken lane those two deliberately diverge
   *  (cSAI / cWBTC2). A mint moves the underlying and the cToken in one
   *  transaction, so both appear in the flows and matching by symbol is what
   *  keeps the right one. */
  flows?: AssetFlow[];
}

export function CompoundV2EventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  wallet,
  flows,
}: CompoundV2EventHeaderProps) {
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const cSym = market?.cSymbol ?? `c${ctx.marketSymbol}`;
  const coords: CompoundV2Coords = {
    txHash,
    blockNumber,
    ctoken: market?.ctoken,
    marketLabel: cSym,
    account: wallet,
  };
  const deltas: ChainTruthDelta[] = [];

  if (ctx.eventType === "liquidation") {
    const covered = Number(ctx.assetsDelta ?? "0") || 0;
    if (covered !== 0)
      deltas.push({
        value: covered,
        symbol: ctx.marketSymbol,
        address: soleFlowAddress(flows, ctx.marketSymbol),
        prov: liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount),
      });
    const seized = Number(ctx.seizeTokens ?? "0") || 0;
    if (seized !== 0 && ctx.collateralSymbol) {
      const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
      const collCSym = collM?.cSymbol ?? `c${ctx.collateralSymbol}`;
      deltas.push({
        value: -seized,
        symbol: collCSym,
        address: soleFlowAddress(flows, collCSym),
        prov: seizeTokensProv(collCSym, coords, ctx.raw?.seizeTokens),
      });
    }
  } else if (ctx.eventType === "seize_out" || ctx.eventType === "seize_burn") {
    // Borrower-loss seize legs: no spine flank (the card renders the warning
    // icon there, not a token row), so these stay outside movedDeltaProv.
    const d = Number(ctx.cTokensDelta ?? "0") || 0;
    if (d !== 0)
      deltas.push({
        value: d,
        symbol: cSym,
        address: soleFlowAddress(flows, cSym),
        prov: seizeLegProv(cSym, ctx.eventType, coords, ctx.raw?.cTokens),
      });
  } else {
    // mint/redeem/borrow/repay (underlying) · transfer_in/transfer_out ·
    // seize_in (cToken) — the shared lane movedDeltaProv also serves the
    // card's spine echo from, so header and echo can never drift apart.
    const isCTokenLane =
      ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out" || ctx.eventType === "seize_in";
    const raw = isCTokenLane ? ctx.raw?.cTokens : ctx.raw?.amount;
    const d = Number((isCTokenLane ? ctx.cTokensDelta : ctx.assetsDelta) ?? "0") || 0;
    const prov = movedDeltaProv(ctx.eventType, ctx.marketSymbol, cSym, coords, raw);
    const shown = isCTokenLane ? cSym : ctx.marketSymbol;
    if (d !== 0 && prov) deltas.push({ value: d, symbol: shown, address: soleFlowAddress(flows, shown), prov });
  }

  // Party chips. Transfers name their counterparty neutrally; the seizure
  // legs name theirs with prefixes that say the collateral was TAKEN —
  // "seized by <liquidator>" on the borrower's loss, "seized from <borrower>"
  // on the liquidator's receipt. The burn leg has no counterparty: the tokens
  // cease to exist. A liquidation names its liquidator.
  const party =
    ctx.eventType === "transfer_in" && ctx.counterparty
      ? {
          prefix: "from",
          address: ctx.counterparty,
          prov: transferAmountProv(cSym, "in", coords),
          ens: true,
        }
      : ctx.eventType === "transfer_out" && ctx.counterparty
        ? {
            prefix: "to",
            address: ctx.counterparty,
            prov: transferAmountProv(cSym, "out", coords),
            ens: true,
          }
        : ctx.eventType === "seize_out" && ctx.counterparty
          ? {
              prefix: "seized by",
              address: ctx.counterparty,
              prov: seizeLegProv(cSym, "seize_out", coords, ctx.raw?.cTokens),
            }
          : ctx.eventType === "seize_in" && ctx.counterparty
            ? {
                prefix: "seized from",
                address: ctx.counterparty,
                prov: seizeLegProv(cSym, "seize_in", coords, ctx.raw?.cTokens),
              }
            : ctx.eventType === "liquidation" && ctx.liquidator
              ? {
                  prefix: "by",
                  address: ctx.liquidator,
                  prov: liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount),
                }
              : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: ctx.eventType === "liquidation" || ctx.eventType === "seize_out" || ctx.eventType === "seize_burn",
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
