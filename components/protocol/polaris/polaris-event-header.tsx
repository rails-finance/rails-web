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
// Deltas are the log's own `_collChange` / `_debtChange` — the holder's legs.
// An open / adjust / close touch may ALSO carry a settled PSM share (the
// market's mint/redemption activity moves every CDP pro rata, and the effect
// lands on the CDP's own next touch as `_mintRedeemCollGain` /
// `_mintRedeemDebtGain`): it renders AFTER the holder's own deltas as one
// signed "PSM share" in the debt unit at the row's price at block (two signed
// legs where the row has no price), neutral rb-500 (a market fact, not a
// holder choice — no caution tone, no pill), with `noSpineCounterpart` since
// the spine draws the holder's own flows only. A liquidation states the pool's seizure with caution labels,
// then the surplus set aside for the owner as a neutral "Claimable" leg when
// there is one (lib/polaris/liquidation-legs.ts holds the three-leg rule),
// and names the liquidator as a neutral party; a transfer names the recipient
// the same way.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import type { ChainTruthDelta, ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import {
  ledgerFieldProv,
  liquidatorProv,
  psmShareNetProv,
  transferProv,
  type PolarisCoords,
} from "@/lib/polaris/event-provenance";
import { polarisLiquidationDeltas } from "@/lib/polaris/liquidation-legs";
import { CR_CHIP_TITLE, crChipText, polarisCrAtEvent, polarisCrReceipt } from "@/lib/polaris/cr-at-event";
import { PETH, POLARIS_MARKET_CONFIG } from "@/lib/polaris/asset-catalog";
import { formatExact, formatNumber, withRealMinus } from "@/lib/utils/format";
import { polarisPsmShareValue } from "@/lib/polaris/economics";
import { formatPeth } from "@/lib/polaris/figure-format";
import { PSM_SHARE_LABEL } from "@/lib/polaris/row-kinds";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** The row's spec, with the ratio chip where Display shows the collateral ratio. */
export function usePolarisHeadSpec(actionLabel: string, ctx: PolarisContext, coords: PolarisCoords): ChainTruthRowSpec {
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
        return { text: crChipText(cr.pct), value: r.value, belowMin: cr.belowMin, prov: r.info, title: CR_CHIP_TITLE };
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

  // Pushes the settled PSM share, when non-zero, after the holder's own
  // deltas — the market's pro-rata share of its own mints and redemptions
  // since the CDP's previous touch. Not an axis verb (no holder chose it) and
  // no spine counterpart (the spine draws the holder's own flows only), so the
  // header keeps the figure at ≥sm. With the row's price at block it is one
  // signed figure in the debt unit (lib/polaris/economics.ts), its receipt
  // carrying both legs and the price; without one, the two legs, each signed.
  const pushPsmLegs = (): void => {
    if (mrColl === 0 && mrDebt === 0) return;
    const price = ctx.priceAtBlock?.pethInDebt;
    if (price != null && price > 0) {
      const net = polarisPsmShareValue(mrColl, mrDebt, price);
      deltas.push({
        value: net,
        symbol: stable,
        address: stableAddr,
        label: PSM_SHARE_LABEL,
        signed: true,
        exact: withRealMinus(`${net < 0 ? "" : "+"}${formatExact(net)}`),
        prov: psmShareNetProv(coords, {
          coll: mrColl,
          debt: mrDebt,
          price,
          collRaw: ctx.raw?.mintRedeemCollGain,
          debtRaw: ctx.raw?.mintRedeemDebtGain,
          priceRaw: ctx.priceAtBlock?.raw,
        }),
        noSpineCounterpart: true,
      });
      return;
    }
    // One name for the pair, on the first leg; each side signed by what it did.
    if (mrColl !== 0)
      deltas.push({
        value: mrColl,
        symbol: PETH.symbol,
        address: PETH.address,
        label: PSM_SHARE_LABEL,
        signed: true,
        prov: ledgerFieldProv("mintRedeemCollGain", coords, ctx.raw?.mintRedeemCollGain),
        noSpineCounterpart: true,
      });
    if (mrDebt !== 0)
      deltas.push({
        value: mrDebt,
        symbol: stable,
        address: stableAddr,
        ...(mrColl !== 0 ? {} : { label: PSM_SHARE_LABEL }),
        signed: true,
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
    // The empty-label combined-adjust grammar keys off the HOLDER's own
    // deltas, not the row's deltas overall — a touch with only a PSM leg
    // (no holder deposit/withdraw/borrow/repay) keeps `actionLabel`, or a
    // dropped verb would read as if the PSM's own share was the holder's
    // action.
    label: isOpen ? "Open" : isAdjust && holderDeltaCount > 0 ? "" : actionLabel,
    // Open and Close take Liquity V2's status pills.
    status: isOpen ? "open" : ctx.eventType === "close" ? "close" : undefined,
    critical: ctx.eventType === "liquidate",
    deltas: shown,
    party,
    ratioChip,
  };
}
