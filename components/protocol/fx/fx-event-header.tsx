"use client";

// f(x) event header — adapter onto the shared ChainTruthRow grammar. Maps the
// signed amount(s) this event moved into the shared row spec; traces via
// <Prov>. Units are the point and each delta names its own: an operate's
// collateral delta is the TOKEN as transferred (wstETH / WBTC), a
// liquidation's seizure is NORMALIZED 1e18 units (stETH-equivalent for the
// wstETH pool) and carries the normalized symbol; debt is fxUSD everywhere —
// rendered as fxUSD, never equated to dollars.

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
  type FxCoords,
} from "@/lib/fx/event-provenance";
import { FX_POOLS, isFxPoolKey } from "@/lib/fx/asset-catalog";

export interface FxEventHeaderProps {
  actionLabel: string;
  ctx: FxContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
  /** The pool's rate-normalized unit symbol (stETH / WBTC) — liquidation
   *  seizures are quoted in it, not the token symbol. */
  normalizedSymbol: string;
  /** The verdict-passing third-party signer (fx-event-card's two-fact
   *  predicate) — presence renders the pink external-actor chip. */
  externalBy?: string;
  /** The event's flows, read for the contract behind each delta's symbol. Units
   *  are the point on this explorer and the addresses follow them: the pool
   *  token and fxUSD are the assets that actually moved and the flows name
   *  them, while `normalizedSymbol` is a rate-normalized UNIT rather than a
   *  transferred token — the lookup for it answers only in the case where a
   *  flow really did carry that asset, and otherwise leaves the chip to its
   *  symbol, which is the correct outcome for a unit nothing transferred. */
  flows?: AssetFlow[];
}

export function FxEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
  normalizedSymbol,
  externalBy,
  flows,
}: FxEventHeaderProps) {
  const normAddr = soleFlowAddress(flows, normalizedSymbol);
  const fxusdAddr = soleFlowAddress(flows, "fxUSD");
  const meta = isFxPoolKey(ctx.pool) ? FX_POOLS[ctx.pool] : undefined;
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
  const isOpen = !!ctx.isOpen;
  const isAdjust = ctx.eventType === "operate" && !isOpen && !ctx.emptiesPosition;
  const perAxis = isOpen || isAdjust;

  if (ctx.eventType === "tickRebalance") {
    // TICK-level amounts (the whole tick's clear), NOT this position's slice —
    // the logs never state the slice (fx.ts tick-lineage header), and the
    // settled reconciliation on the card carries the exact per-position drift.
    // Every other row's header delta IS the position's own figure, so a bare
    // "−140.58" here would read as one. The deltas therefore take the
    // redemption grammar (Liquity V1/fork "Cleared" / "Reduced"): a caution
    // label per axis carries the meaning and the value renders as a bare
    // magnitude. Each axis gets its own verb, the tick named once, so the
    // pair reads as one clause — "Tick cleared 140.58 ◊ · Repaid 249K ♭"
    // (the tick's collateral was sold, its fxUSD debt repaid with the
    // proceeds), never "Tick cleared … Tick cleared …" and never "−140.58 ◊".
    // The detail grid repeats the same figures under their "· whole tick"
    // captions, beside this position's own slice when its stretch is read.
    const colls = Number(ctx.tickRebColls ?? "0") || 0;
    if (colls !== 0)
      deltas.push({
        value: -colls,
        symbol: normalizedSymbol,
        address: normAddr,
        prov: tickRebAmountProv("colls", normalizedSymbol, coords, undefined),
        label: "Tick cleared",
        tone: "caution",
      });
    const debt = Number(ctx.tickRebFxusdDebts ?? "0") || 0;
    if (debt !== 0)
      deltas.push({
        value: -debt,
        symbol: "fxUSD",
        address: fxusdAddr,
        prov: tickRebAmountProv("fxusd", "fxUSD", coords, undefined),
        // The collateral delta already scopes the clause to the tick; a
        // second "Tick" would only repeat it.
        label: colls !== 0 ? "Repaid" : "Tick repaid",
        tone: "caution",
      });
  } else if (ctx.eventType === "liquidation") {
    // Seized collateral — NORMALIZED units (the LiquidatePosition event's own
    // basis), so it carries the normalized symbol.
    const seized = Number(ctx.liqColls ?? "0") || 0;
    if (seized !== 0)
      deltas.push({
        value: -seized,
        symbol: normalizedSymbol,
        address: normAddr,
        prov: liqCollsProv(normalizedSymbol, coords),
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
        label: isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
        status: isOpen ? "open" : undefined,
        critical: ctx.eventType === "liquidation",
        // Rebalance rows follow the redemption grammar: the spine's caution
        // pill carries the action name on desktop, the label becomes a
        // mobile badge, and the tick-level amounts stay in the header (the
        // warning spine shows no flanking numbers).
        labelOnSpine: ctx.eventType === "tickRebalance",
        deltas,
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
              }
            : undefined,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
