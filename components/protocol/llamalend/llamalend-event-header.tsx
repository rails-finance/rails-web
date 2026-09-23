"use client";

// LlamaLend event header — adapter onto the shared ChainTruthRow grammar.
// Maps the event's own emitted amounts (collateral and/or debt — one event
// can move both) into the shared row spec; traces via <Prov>. Liquidation
// rows follow their LEG: the borrower's row carries a NEUTRAL party chip
// whose prefix says what happened ("liquidated by") — the balances were
// TAKEN, and the copy never reads as an act the borrower performed; the
// LIQUIDATOR's row is that subject's own act ("borrower <addr>" names whose
// position moved); a SELF-liquidation is the user's own close.

import type { AssetFlow, LlamalendContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  collateralDeltaProv,
  debtDeltaProv,
  liquidationProv,
  type LlamalendCoords,
} from "@/lib/llamalend/event-provenance";

export interface LlamalendEventHeaderProps {
  actionLabel: string;
  ctx: LlamalendContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** The position owner, for the receipt's user row. */
  wallet?: string;
  /** The event's own movements, read for the two markets' contract addresses.
   *  LlamaLend's controllers are deployed per collateral pair by a factory, so
   *  the symbols arriving here are drawn from a growing set that no hand-kept
   *  table can stay ahead of — and without an address the chip never reaches a
   *  CDN at all. The event states both contracts; this reads them. */
  flows?: AssetFlow[];
}

export function LlamalendEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  wallet,
  flows,
}: LlamalendEventHeaderProps) {
  const coords: LlamalendCoords = { txHash, blockNumber, controller: ctx.controller, user: wallet };
  const isLiq = ctx.eventType === "liquidation";
  const role = ctx.role ?? (isLiq ? "borrower" : undefined);
  const self = role === "self" || !!ctx.selfLiquidation;
  const borrowerLoss = isLiq && role === "borrower" && !self;

  const deltas: ChainTruthDelta[] = [];
  const coll = Number(ctx.collateralDelta ?? "0") || 0;
  const debt = Number(ctx.debtDelta ?? "0") || 0;
  if (coll !== 0) {
    deltas.push({
      value: coll,
      symbol: ctx.collateralSymbol,
      address: soleFlowAddress(flows, ctx.collateralSymbol),
      prov: isLiq
        ? liquidationProv("collateral", ctx.collateralSymbol, role ?? "borrower", coords, ctx.raw?.collateralDelta)
        : collateralDeltaProv(ctx.collateralSymbol, ctx.eventType, coords, ctx.raw?.collateralDelta),
    });
  }
  if (debt !== 0) {
    deltas.push({
      value: debt,
      symbol: ctx.borrowedSymbol,
      address: soleFlowAddress(flows, ctx.borrowedSymbol),
      prov: isLiq
        ? liquidationProv("debt", ctx.borrowedSymbol, role ?? "borrower", coords, ctx.raw?.debtDelta)
        : debtDeltaProv(ctx.borrowedSymbol, ctx.eventType, coords, ctx.raw?.debtDelta),
    });
  }

  // No external-actor verdict here: the third-party predicate needs BOTH the tx
  // sender AND an event-emitted party param, and no LlamaLend row has ever
  // satisfied it. Measured 2026-07-27 against the whole index (not a sample):
  // of 54,998 borrow and 31,629 repay rows, **30 carry both facts**, and on
  // every one of them the owner is either the signer or the caller — **0 would
  // mark**. `caller` is a V2-only surface (36 borrow rows in total; the V1
  // controller never emits one), so on V1 the chip is impossible by contract,
  // and on V2 it is merely unexercised. A sender-only test would over-mark
  // every routed flow, so the chip is omitted rather than guessed.
  //
  // ⚠️⚠️ Two earlier versions of this comment were WRONG, both from measuring
  // ONE position instead of the table:
  //   • "V2 adds `caller`, but its markets are pre-launch" — read as "this
  //     turns on when V2 ships". V2 shipped; nothing changed.
  //   • "the two facts are MUTUALLY EXCLUSIVE BY VERSION … a V2 position
  //     carried `caller` on 7 of 7 rows and `txFrom` on none" — a SAMPLING
  //     ARTEFACT. That position's rows were all ingested the same day, and
  //     `tx_from` arrives on a nightly Etherscan top-up (04:30, healthy: it
  //     resolved every llamalend row it found on its last run). The V2 fixture
  //     controller in fact carries `txFrom` on 9 of its 18 borrow rows, and 0
  //     of 45 controllers lack it entirely.
  // So this is NOT waiting on a backend fill. 🔑 A per-position sample cannot
  // tell "the pipeline never provides this" from "these rows are newer than the
  // last top-up" — ask the table.
  const party = borrowerLoss
    ? ctx.liquidator
      ? {
          prefix: "liquidated by",
          address: ctx.liquidator,
          prov: liquidationProv("debt", ctx.borrowedSymbol, "borrower", coords, ctx.raw?.debtDelta),
        }
      : undefined
    : isLiq && role === "liquidator" && ctx.positionUser
      ? {
          prefix: "borrower",
          address: ctx.positionUser,
          prov: liquidationProv("debt", ctx.borrowedSymbol, "liquidator", coords, ctx.raw?.debtDelta),
        }
      : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: actionLabel,
        critical: borrowerLoss,
        deltas,
        party,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
