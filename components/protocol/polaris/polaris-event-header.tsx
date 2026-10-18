"use client";

// Polaris event head — the card's `head` slot (ui-jobs 309), drawn by the
// shared ChainTruthRow. Maps each touch's log figures into the row spec;
// traces via <Prov>.
//
// NO RATE PILL, by decision: Polaris rates are algorithmic — the market sets
// them, the holder never chose one — and the pill grammar marks a rate the
// holder (or a delegate) CHOSE. The rate in force at the touch is a fact on
// the row, stated in the detail body instead.
//
// Deltas are the log's own `_collChange` / `_debtChange` — the holder's legs —
// and, on the open and the close, the gas compensation escrow beside them.
// A settled PSM share stays off the head: the sheet and the explanation state
// it. A liquidation states the pool's seizure with caution labels, then the
// surplus set aside for the owner as a neutral "Claimable" leg when
// there is one (lib/polaris/liquidation-legs.ts holds the three-leg rule),
// and names the liquidator as a neutral party; a transfer names the recipient
// the same way. No ratio chip (Miles, 18 Oct 2026): the sheet's Risk panel
// states the collateral ratio.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import {
  gasCompEscrowProv,
  gasCompReturnProv,
  ledgerFieldProv,
  liquidatorProv,
  transferProv,
  type PolarisCoords,
} from "@/lib/polaris/event-provenance";
import { polarisLiquidationDeltas } from "@/lib/polaris/liquidation-legs";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatNumber } from "@/lib/utils/format";
import { formatPeth } from "@/lib/polaris/figure-format";
import { POLARIS_WORDS } from "@/lib/polaris/event-templates";
import { POLARIS_LIQ_CONSTANTS } from "./polaris-liquidation-forensics";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The row's spec. */
export function polarisHeadSpec(actionLabel: string, ctx: PolarisContext, coords: PolarisCoords): ChainTruthRowSpec {
  const stable = ctx.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[ctx.market].stable.address;
  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  const collVerb = (d: number): string => (d > 0 ? "Deposit" : "Withdraw");
  const debtVerb = (d: number): string => (d > 0 ? "Borrow" : "Repay");

  const deltas: ChainTruthDelta[] = [];
  const isOpen = ctx.eventType === "open";
  const isAdjust = ctx.eventType === "adjust";
  // The gas compensation escrow, the holder's own pETH held apart from the
  // collateral: sent with it at the open, returned with it at the close. The
  // log does not carry it; the amount is the protocol's constant. It is the
  // holder's flow, so the spine draws it (polaris-event-card.tsx) and the
  // figure hands off there at ≥sm, the word staying. A liquidation states it
  // as the liquidator's gas compensation in the card instead.
  const pushEscrow = (): void => {
    const close = ctx.eventType === "close";
    const amount = POLARIS_LIQ_CONSTANTS.gasComp.amount;
    deltas.push({
      value: close ? -amount : amount,
      symbol: PETH.symbol,
      address: PETH.address,
      label: POLARIS_WORDS.escrow_leg,
      axisVerb: true,
      exact: String(amount),
      prov: close ? gasCompReturnProv(coords) : gasCompEscrowProv(coords),
    });
  };

  switch (ctx.eventType) {
    case "open":
    case "adjust":
      if (dColl !== 0) {
        deltas.push({
          value: dColl,
          symbol: PETH.symbol,
          address: PETH.address,
          label: collVerb(dColl),
          axisVerb: true,
          prov: ledgerFieldProv("collChange", coords, ctx.raw?.collChange),
        });
      }
      if (dDebt !== 0) {
        deltas.push({
          value: dDebt,
          symbol: stable,
          address: stableAddr,
          label: debtVerb(dDebt),
          axisVerb: true,
          prov: ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange),
        });
      }
      if (isOpen) pushEscrow();
      break;
    case "close":
      // Close keeps its label + signed deltas (the no-deltas/close rule).
      if (dColl !== 0) {
        deltas.push({
          value: dColl,
          symbol: PETH.symbol,
          address: PETH.address,
          prov: ledgerFieldProv("collChange", coords, ctx.raw?.collChange),
        });
      }
      if (dDebt !== 0) {
        deltas.push({
          value: dDebt,
          symbol: stable,
          address: stableAddr,
          prov: ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange),
        });
      }
      pushEscrow();
      break;
    case "liquidate":
      deltas.push(...polarisLiquidationDeltas(ctx, coords));
      break;
    case "transfer":
      break;
  }

  // One rounding rule for a figure wherever it appears — the row, the spine
  // and the card state it in full, pETH to four decimals and the stablecoin
  // to three — and each amount names its token in words beside the glyph. A verb's
  // amount carries no ticker: at ≥sm its figure and glyph hand off to the
  // spine, and the ticker would stand alone after the verb.
  const shown: ChainTruthDelta[] = deltas.map((d) => ({
    ...d,
    display: d.display ?? (d.symbol === PETH.symbol ? formatPeth : formatNumber)(Math.abs(d.value)),
    ...(d.axisVerb ? {} : { suffix: d.symbol }),
  }));

  const party =
    ctx.eventType === "liquidate" && ctx.liquidator
      ? { prefix: "liquidated by", address: ctx.liquidator, prov: liquidatorProv(coords) }
      : ctx.eventType === "transfer" && ctx.toAddr
        ? { prefix: "to", address: ctx.toAddr, prov: transferProv(coords) }
        : undefined;

  return {
    // An adjust whose deltas carry the verbs drops its label; one that moved
    // nothing of the holder's (a touch that only settled a PSM share) keeps
    // `actionLabel`, its row kind.
    label: isOpen ? "Open" : isAdjust && deltas.length > 0 ? "" : actionLabel,
    // Open and Close take Liquity V2's status pills.
    status: isOpen ? "open" : ctx.eventType === "close" ? "close" : undefined,
    critical: ctx.eventType === "liquidate",
    deltas: shown,
    party,
  };
}
