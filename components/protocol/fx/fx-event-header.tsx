"use client";

// f(x) event header — adapter onto the shared ChainTruthRow grammar. Maps the
// signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Collateral on every row is the TOKEN (wstETH / WBTC) — an operate's
// delta, what a liquidation or rebalance sent to the keeper; the detail grid
// states the stETH-equivalent. Debt is fxUSD everywhere, never equated to
// dollars.

import type { AssetFlow, FxContext } from "@/lib/shared/types/event-shape";
import { soleFlowAddress } from "@/lib/shared/format-event";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import {
  collDeltaProv,
  debtDeltaProv,
  liqCollsProv,
  liqDebtTotalProv,
  transferPartyProv,
  fxExternalActorProv,
  tickRebAmountProv,
  rowChangeProv,
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { fxBlockChange, useFxSocializedReads } from "@/lib/fx/socialized-reads";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";
import { fxLiquidationMoved } from "@/lib/fx/row-figures";

export interface FxEventHeaderProps {
  actionLabel: string;
  ctx: FxContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** The verdict-passing third-party signer (fx-event-card's two-fact
   *  predicate) — presence renders the pink external-actor chip. */
  externalBy?: string;
  /** The event's flows, read for the contract behind each delta's symbol. */
  flows?: AssetFlow[];
  /** The row's id: a socialized row states the position's change only when it
   *  is its block's first row (lib/fx/socialized-reads.tsx). */
  eventId?: string;
}

export function FxEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  externalBy,
  flows,
  eventId,
}: FxEventHeaderProps) {
  const socialized = useFxSocializedReads();
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
  const tokenSym = meta?.tokenSymbol ?? ctx.poolSymbol;
  const tokenAddr = meta?.tokenAddress ?? soleFlowAddress(flows, tokenSym);
  const fxusdAddr = soleFlowAddress(flows, "fxUSD");
  const coords: FxCoords = {
    txHash,
    blockNumber,
    pool: meta?.address,
    poolLabel: ctx.poolSymbol,
    positionId: ctx.positionId,
  };
  const deltas: ChainTruthDelta[] = [];

  // Opens + owner adjusts (operate events) get V2's per-axis grammar: each axis
  // its own imperative verb (Deposit/Withdraw collateral, Borrow/Repay fxUSD), so
  // an open shows a green pill + labeled axes and a combined adjust drops the
  // merged "Deposit & Borrow" verb. `ctx.isOpen` already rides the context. A
  // close (emptiesPosition) keeps its "Close Position" label; liquidations,
  // rebalances and transfers keep their own grammar. No rate pill (no chosen rate).
  const isOpen = !!ctx.isOpen || !!ctx.reopens;
  const isAdjust = ctx.eventType === "operate" && !isOpen && !ctx.emptiesPosition;
  const perAxis = isOpen || isAdjust;

  const poolLiq = ctx.eventType === "liquidation" && ctx.poolWide === true;
  let note: string | undefined;
  if (ctx.eventType === "liquidation" && !poolLiq && !fxLiquidationMoved(ctx)) note = "nothing left to take";
  if (ctx.eventType === "tickRebalance" || poolLiq) {
    // This position's change first: getPosition at block − 1 and at the block,
    // stated on the block's top row (the read covers every row in it).
    const lead = blockNumber != null && eventId != null && socialized?.leads.has(eventId) === true;
    const change = lead ? fxBlockChange(socialized?.reads, blockNumber as number) : null;
    const peers = blockNumber != null ? (socialized?.peers?.get(blockNumber) ?? 1) : 1;
    // Kept short: a longer note pushes the date onto a second line at 1280 px.
    if (peers > 1) note = lead ? `${peers === 2 ? "both" : `all ${peers}`} in this block` : "included above";
    if (poolLiq && change) {
      const repaid = Number(ctx.tickRebFxusdDebts ?? "0") || 0;
      if (-change.debt - repaid > 0.001) note = "debt written off";
    }
    const normSym = meta?.normalizedSymbol ?? tokenSym;
    if (change) {
      if (Math.abs(change.coll) > 1e-12)
        deltas.push({
          value: change.coll,
          symbol: normSym,
          address: normSym === tokenSym ? tokenAddr : undefined,
          prov: rowChangeProv("coll", normSym, coords),
          noSpineCounterpart: true,
          readableLabel: true,
        });
      if (Math.abs(change.debt) > 1e-12)
        deltas.push({
          value: change.debt,
          symbol: "fxUSD",
          address: fxusdAddr,
          prov: rowChangeProv("debt", normSym, coords),
          noSpineCounterpart: true,
          readableLabel: true,
        });
    }
  }
  if (ctx.eventType === "tickRebalance" || poolLiq) {
    // TICK-level amounts (the whole tick's clear), NOT this position's slice:
    // drawn muted with the scope word ("Tick cleared 140.58 ◊ · repaid
    // 249K ♭"), so the position's own change beside them reads first.
    const scope = ctx.poolWide ? "Pool" : "Tick";
    const colls = Number(ctx.tickRebColls ?? "0") || 0;
    if (colls !== 0)
      deltas.push({
        value: -colls,
        symbol: tokenSym,
        address: tokenAddr,
        prov: tickRebAmountProv("colls", tokenSym, coords, undefined, ctx.poolWide, poolLiq, ctx.redemption),
        label: poolLiq ? "Pool liquidated" : ctx.redemption ? "Pool redeemed" : `${scope} cleared`,
        muted: true,
        readableLabel: true,
      });
    const debt = Number(ctx.tickRebFxusdDebts ?? "0") || 0;
    if (debt !== 0)
      deltas.push({
        value: -debt,
        symbol: "fxUSD",
        address: fxusdAddr,
        prov: tickRebAmountProv("fxusd", "fxUSD", coords, undefined, ctx.poolWide, poolLiq, ctx.redemption),
        // The collateral delta already scopes the clause; a second scope word
        // would only repeat it.
        label: colls !== 0 ? "repaid" : `${scope} repaid`,
        muted: true,
        readableLabel: true,
      });
  } else if (ctx.eventType === "liquidation") {
    // Collateral sent to the liquidator — token units.
    const seized = Number(ctx.liqColls ?? "0") || 0;
    if (seized !== 0)
      deltas.push({
        value: -seized,
        symbol: tokenSym,
        address: tokenAddr,
        prov: liqCollsProv(tokenSym, coords),
        readableLabel: true,
      });
    // The combined debt cleared (fxUSD-side + stable-side), signed negative —
    // the detail grid splits the two lanes.
    const debt = Number(ctx.debtDelta ?? "0") || 0;
    if (debt !== 0)
      deltas.push({
        value: debt,
        symbol: "fxUSD",
        address: fxusdAddr,
        prov: liqDebtTotalProv(coords),
        readableLabel: true,
      });
  } else {
    const coll = Number(ctx.collDelta ?? "0") || 0;
    if (coll !== 0)
      deltas.push({
        value: coll,
        symbol: ctx.poolSymbol,
        address: soleFlowAddress(flows, ctx.poolSymbol),
        prov: collDeltaProv(ctx.poolSymbol, coords),
        ...(perAxis ? { label: coll > 0 ? "Deposit" : "Withdraw", axisVerb: true } : {}),
      });
    const debt = Number(ctx.debtDelta ?? "0") || 0;
    if (debt !== 0)
      deltas.push({
        value: debt,
        symbol: "fxUSD",
        address: fxusdAddr,
        prov: debtDeltaProv(coords),
        ...(perAxis ? { label: debt > 0 ? "Borrow" : "Repay", axisVerb: true } : {}),
      });
  }

  // Ownership rows: the new holder as a neutral "to 0x…" chip (a mint's
  // holder is its first owner).
  const transferTo = ctx.eventType === "transfer" ? ctx.transferTo : undefined;

  return (
    <ChainTruthRow
      spec={{
        label: ctx.reopens ? "Opened again" : isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
        status: isOpen ? "open" : undefined,
        critical: ctx.eventType === "liquidation",
        // Rebalance rows follow the redemption grammar: the spine's caution
        // pill carries the action name on desktop, the label becomes a
        // mobile badge, and the tick-level amounts stay in the header (the
        // warning spine shows no flanking numbers).
        labelOnSpine: ctx.eventType === "tickRebalance" || poolLiq,
        deltas,
        note,
        party: transferTo
          ? {
              prefix: "to",
              address: transferTo,
              prov: transferPartyProv("to", coords),
            }
          : undefined,
        externalActor:
          externalBy && ctx.ownerAt && ctx.txFrom
            ? {
                address: externalBy,
                prov: fxExternalActorProv({ owner: ctx.ownerAt, txFrom: ctx.txFrom }, coords),
                tip: (
                  <>
                    {externalBy} sent this transaction. The holder of the position at this block was {ctx.ownerAt}.
                  </>
                ),
              }
            : undefined,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
