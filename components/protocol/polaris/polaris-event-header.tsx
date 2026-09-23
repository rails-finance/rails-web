"use client";

// Polaris event header — adapter onto the shared ChainTruthRow grammar. Maps
// each touch's own log figures into the row spec; traces via <Prov>.
//
// NO RATE PILL, by decision: Polaris rates are algorithmic — the market sets
// them, the holder never chose one — and the pill grammar marks a rate the
// holder (or a delegate) CHOSE. The rate in force at the touch is a fact on
// the row, stated in the detail body instead.
//
// Deltas are the log's own `_collChange` / `_debtChange` — the holder's legs.
// An open / adjust / close touch may ALSO carry a settled PSM share (the
// market's mint/redemption activity moves every CDP pro rata, and the effect
// lands on the CDP's own next touch as `_mintRedeemCollGain` /
// `_mintRedeemDebtGain`): those legs render AFTER the holder's own deltas,
// neutral rb-500 (a market fact, not a holder choice — no caution tone, no
// pill), with `noSpineCounterpart` since the spine draws the holder's own
// flows only. A liquidation states the pool's seizure with caution labels,
// then the surplus set aside for the owner as a neutral "Claimable" leg when
// there is one (lib/polaris/liquidation-legs.ts holds the three-leg rule),
// and names the liquidator as a neutral party; a transfer names the recipient
// the same way.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import { ChainTruthRow, type ChainTruthDelta } from "@/components/shared/chain-truth-event";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { ledgerFieldProv, liquidatorProv, transferProv, type PolarisCoords } from "@/lib/polaris/event-provenance";
import { polarisLiquidationDeltas } from "@/lib/polaris/liquidation-legs";
import { crChipText, polarisCrAtEvent, polarisCrReceipt } from "@/lib/polaris/cr-at-event";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";

export interface PolarisEventHeaderProps {
  actionLabel: string;
  ctx: PolarisContext;
  timestamp: number;
  txHash?: string;
  blockNumber?: number;
  eventNumber?: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function PolarisEventHeader({
  actionLabel,
  ctx,
  timestamp,
  txHash,
  blockNumber,
  eventNumber,
}: PolarisEventHeaderProps) {
  const coords: PolarisCoords = { txHash, blockNumber, market: ctx.market, cdpId: ctx.cdpId };
  const stable = ctx.stableSymbol;
  const stableAddr = POLARIS_MARKET_CONFIG[ctx.market].stable.address;
  // The trailing ratio chip, behind the Collateral Ratio display flag: the
  // CDP's ratio at this event, CR only (never LTV, so the row agrees with the
  // card above it), red only below the market's normal-mode minimum. The
  // figure and its receipt come from lib/polaris/cr-at-event.ts, the same
  // place the detail metric and the export read, and the chip is an echo of
  // the metric's receipt. Nothing on a row without a price.
  const { showCollateralRatio } = useTimelineDisplay();
  const cr = showCollateralRatio ? polarisCrAtEvent(ctx) : undefined;
  const ratioChip = cr
    ? (() => {
        const r = polarisCrReceipt(ctx, coords, cr);
        return { text: crChipText(cr.pct), value: r.value, belowMin: cr.belowMin, prov: r.info };
      })()
    : undefined;
  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  const collVerb = (d: number): string => (d > 0 ? "Deposit" : "Withdraw");
  const debtVerb = (d: number): string => (d > 0 ? "Borrow" : "Repay");
  const mrColl = num(ctx.mintRedeemCollGain);
  const mrDebt = num(ctx.mintRedeemDebtGain);

  const deltas: ChainTruthDelta[] = [];
  const isOpen = ctx.eventType === "open";
  const isAdjust = ctx.eventType === "adjust";
  // Counts the holder's OWN deltas only (Deposit/Withdraw/Borrow/Repay) — a
  // PSM leg is the market's, not the holder's, so it must not empty the row
  // label on a touch the holder did nothing but receive a PSM share on.
  let holderDeltaCount = 0;

  // Pushes the settled PSM legs, when non-zero, after the holder's own
  // deltas — same log, same touch, the market's pro-rata share of its own
  // mints/redemptions. Not an axis verb (no holder chose it) and no spine
  // counterpart (the spine draws the holder's own flows only), so the
  // header keeps the figure at ≥sm.
  const pushPsmLegs = (): void => {
    if (mrColl !== 0)
      deltas.push({
        value: mrColl,
        symbol: PETH.symbol,
        address: PETH.address,
        label: mrColl > 0 ? "PSM added" : "PSM redeemed",
        prov: ledgerFieldProv("mintRedeemCollGain", coords, ctx.raw?.mintRedeemCollGain),
        noSpineCounterpart: true,
      });
    if (mrDebt !== 0)
      deltas.push({
        value: mrDebt,
        symbol: stable,
        address: stableAddr,
        label: mrDebt > 0 ? "PSM minted" : "PSM cleared",
        prov: ledgerFieldProv("mintRedeemDebtGain", coords, ctx.raw?.mintRedeemDebtGain),
        noSpineCounterpart: true,
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
        holderDeltaCount++;
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
        holderDeltaCount++;
      }
      pushPsmLegs();
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
        holderDeltaCount++;
      }
      if (dDebt !== 0) {
        deltas.push({
          value: dDebt,
          symbol: stable,
          address: stableAddr,
          prov: ledgerFieldProv("debtChange", coords, ctx.raw?.debtChange),
        });
        holderDeltaCount++;
      }
      pushPsmLegs();
      break;
    case "liquidate":
      deltas.push(...polarisLiquidationDeltas(ctx, coords));
      break;
    case "transfer":
      break;
  }

  const party =
    ctx.eventType === "liquidate" && ctx.liquidator
      ? { prefix: "liquidated by", address: ctx.liquidator, prov: liquidatorProv(coords) }
      : ctx.eventType === "transfer" && ctx.toAddr
        ? { prefix: "to", address: ctx.toAddr, prov: transferProv(coords) }
        : undefined;

  return (
    <ChainTruthRow
      spec={{
        // The empty-label combined-adjust grammar keys off the HOLDER's own
        // deltas, not the row's deltas overall — a touch with only a PSM leg
        // (no holder deposit/withdraw/borrow/repay) keeps `actionLabel`, or a
        // dropped verb would read as if the PSM's own share was the holder's
        // action.
        label: isOpen ? "Open" : isAdjust && holderDeltaCount > 0 ? "" : actionLabel,
        status: isOpen ? "open" : undefined,
        critical: ctx.eventType === "liquidate",
        deltas,
        party,
        ratioChip,
      }}
      timestamp={timestamp}
      eventNumber={eventNumber}
    />
  );
}
