"use client";

// Compound V2 event detail — adapter onto the shared ChainTruthDetail grid.
// The lanes an event touches, with before→after transitions:
//   mint/redeem  — the supply PRINCIPAL lane (replayed, amounts-only) AND the
//                  cToken lane (slot-exact Transfer replay) side by side; the
//                  two bases are the point, each traced to its own class.
//   borrow/repay — the debt lane: after = the EMITTED accountBorrows (interest
//                  to this moment included), before = ∓ the event's own amount.
//   transfers    — the cToken lane (a position can arrive or leave by transfer).
//   liquidation  — ONE row (the index merged the repay leg the liquidation
//                  itself emitted), so unlike the Moonwell mold the debt lane
//                  transitions HERE: the close-factor halving reads
//                  before→after like a repay, beside the collateral seized.
//   seize legs   — the cToken lane: collateral taken (or burned as the
//                  protocol's cut) transitions the exact balance like any
//                  Transfer — it just wasn't the borrower's act.

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  assetsDeltaProv,
  cTokensDeltaProv,
  transferAmountProv,
  seizeLegProv,
  accountBorrowsProv,
  debtBeforeProv,
  seizeTokensProv,
  liqDebtRepaidProv,
  supplyAfterProv,
  supplyBeforeProv,
  cTokensAfterProv,
  cTokensBeforeProv,
  liqAtBlockPriceProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  liqPremiumProv,
  liqIncentiveRefProv,
  type CompoundV2Coords,
} from "@/lib/compound-v2/event-provenance";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";
import { compoundV2LiquidationValues } from "@/lib/compound-v2/liquidation-values";
import { formatNumber, formatUsdValue, formatPrice } from "@/lib/utils/format";

export interface CompoundV2EventDetailProps {
  ctx: CompoundV2Context;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/**
 * The valued two-leg liquidation breakdown, at Compound's OWN oracle price
 * captured at the event block (mig 151). NATIVE-ONLY: the legs are denominated
 * in ETH before the oracle migration (block 10,678,764) and USD after — the
 * exact numeraire the Comptroller computed the seizure in; `priceNumeraire`
 * says which, and the format seam renders each leg in it. The premium is a
 * ratio of two same-block legs, numeraire-invariant, and should reproduce the
 * liquidation incentive read at the same block (the self-audit beneath it).
 *
 * Undefined until the price walk has priced BOTH legs at this block — the card
 * stays token-only meanwhile (partial fill is a safe state, and a half-valued
 * breakdown would invite a cross-leg comparison the data can't support).
 */
function buildCompoundV2LiqForensics(
  ctx: CompoundV2Context,
  coords: CompoundV2Coords,
): LiquidationForensicsProps | undefined {
  const v = compoundV2LiquidationValues(ctx);
  if (!v) return undefined;
  const { numeraire, seizedUnderlying, repaid, collPrice, debtPrice, seizedValue, clearedValue, incPct } = v;
  const collM = COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket!];

  const collSym = ctx.collateralSymbol ?? collM.symbol;
  const debtSym = ctx.marketSymbol;
  const fmtValue = numeraire === "ETH" ? (n: number) => `${formatNumber(n)} ETH` : formatUsdValue;
  const fmtPrice = numeraire === "ETH" ? (n: number) => `${formatNumber(n)} ETH` : formatPrice;

  return {
    seized: {
      symbol: collSym,
      usd: seizedValue,
      usdProv: liqSeizedValueProv(collSym, numeraire, coords, {
        amount: `${formatNumber(seizedUnderlying)} ${collSym}`,
        price: formatNumber(collPrice),
      }),
    },
    cleared: {
      symbol: debtSym,
      usd: clearedValue,
      usdProv: liqClearedValueProv(debtSym, numeraire, coords, {
        amount: `${formatNumber(repaid)} ${debtSym}`,
        price: formatNumber(debtPrice),
      }),
    },
    premium: seizedValue / clearedValue - 1,
    premiumProv: liqPremiumProv(coords, {
      seized: fmtValue(seizedValue),
      cleared: fmtValue(clearedValue),
      numeraire,
    }),
    premiumReference: {
      label: "Incentive at block",
      value: `+${(incPct * 100).toFixed(2)}%`,
      prov: liqIncentiveRefProv(coords),
    },
    pricePills: [
      {
        symbol: collSym,
        priceUsd: collPrice,
        priceProv: liqAtBlockPriceProv(collSym, numeraire, coords),
        note: "oracle at block",
      },
      {
        symbol: debtSym,
        priceUsd: debtPrice,
        priceProv: liqAtBlockPriceProv(debtSym, numeraire, coords),
        note: "oracle at block",
      },
    ],
    // ETH before the oracle migration, USD after — Compound's own numeraire.
    format: { value: fmtValue, price: fmtPrice },
  };
}

export function CompoundV2EventDetail({ ctx, txHash, blockNumber, wallet }: CompoundV2EventDetailProps) {
  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const cSym = market?.cSymbol ?? `c${ctx.marketSymbol}`;
  const coords: CompoundV2Coords = {
    txHash,
    blockNumber,
    ctoken: market?.ctoken,
    marketLabel: cSym,
    account: wallet,
  };
  const stats: ChainTruthStat[] = [];

  if (ctx.eventType === "mint" || ctx.eventType === "redeem") {
    stats.push({
      label: "Supplied · principal",
      value: fmt(ctx.supplyAfter),
      symbol: ctx.marketSymbol,
      prov: supplyAfterProv(ctx.marketSymbol, coords, ctx.raw?.supplyAfter),
      transition: reconstructTransition({
        after: ctx.supplyAfter,
        change: ctx.assetsDelta,
        changeProv: assetsDeltaProv(ctx.marketSymbol, ctx.eventType, coords, ctx.raw?.amount),
        beforeProv: supplyBeforeProv(ctx.marketSymbol, coords),
      }),
    });
    stats.push({
      label: "cToken balance",
      value: fmt(ctx.cTokensAfter),
      symbol: cSym,
      prov: cTokensAfterProv(cSym, coords, ctx.raw?.cTokensAfter),
      transition: reconstructTransition({
        after: ctx.cTokensAfter,
        change: ctx.cTokensDelta,
        changeProv: cTokensDeltaProv(cSym, ctx.eventType, coords, ctx.raw?.cTokens),
        beforeProv: cTokensBeforeProv(cSym, coords),
      }),
    });
  } else if (ctx.eventType === "borrow" || ctx.eventType === "repay") {
    stats.push({
      label: "Borrowed",
      value: fmt(ctx.debtAfter),
      symbol: ctx.marketSymbol,
      prov: accountBorrowsProv(ctx.marketSymbol, coords, ctx.raw?.accountBorrows),
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.assetsDelta,
        changeProv: assetsDeltaProv(ctx.marketSymbol, ctx.eventType, coords, ctx.raw?.amount),
        beforeProv: debtBeforeProv(ctx.marketSymbol, ctx.eventType, coords),
      }),
    });
  } else if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") {
    stats.push({
      label: "cToken balance",
      value: fmt(ctx.cTokensAfter),
      symbol: cSym,
      prov: cTokensAfterProv(cSym, coords, ctx.raw?.cTokensAfter),
      transition: reconstructTransition({
        after: ctx.cTokensAfter,
        change: ctx.cTokensDelta,
        changeProv: transferAmountProv(cSym, ctx.eventType === "transfer_in" ? "in" : "out", coords, ctx.raw?.cTokens),
        beforeProv: cTokensBeforeProv(cSym, coords),
      }),
    });
  } else if (ctx.eventType === "seize_out" || ctx.eventType === "seize_in" || ctx.eventType === "seize_burn") {
    stats.push({
      label: ctx.eventType === "seize_in" ? "cToken balance" : "Collateral balance",
      value: fmt(ctx.cTokensAfter),
      symbol: cSym,
      prov: cTokensAfterProv(cSym, coords, ctx.raw?.cTokensAfter),
      transition: reconstructTransition({
        after: ctx.cTokensAfter,
        change: ctx.cTokensDelta,
        changeProv: seizeLegProv(cSym, ctx.eventType, coords, ctx.raw?.cTokens),
        beforeProv: cTokensBeforeProv(cSym, coords),
      }),
    });
  } else if (ctx.eventType === "liquidation") {
    const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
    const collCSym = collM?.cSymbol ?? (ctx.collateralSymbol ? `c${ctx.collateralSymbol}` : "cTokens");
    // The debt lane transitions HERE: one liquidation emitted both RepayBorrow
    // and LiquidateBorrow, and the index merged them into this row — so the
    // emitted accountBorrows (from the liquidation's own repay leg) reads
    // before→after like a repay. The collateral movement lands on the sibling
    // seize_* rows.
    stats.push({
      label: "Borrowed",
      value: fmt(ctx.debtAfter),
      symbol: ctx.marketSymbol,
      prov: accountBorrowsProv(ctx.marketSymbol, coords, ctx.raw?.accountBorrows, true),
      transition: reconstructTransition({
        after: ctx.debtAfter,
        change: ctx.assetsDelta,
        changeProv: liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount),
        beforeProv: debtBeforeProv(ctx.marketSymbol, "liquidation", coords),
      }),
    });
    if (ctx.seizeTokens != null) {
      stats.push({
        label: "Collateral seized",
        value: fmt(ctx.seizeTokens),
        symbol: collCSym,
        prov: seizeTokensProv(collCSym, coords, ctx.raw?.seizeTokens),
      });
    }
  }

  // The valued two-leg breakdown, beneath the chain-state grid — only once the
  // oracle-at-block walk has priced BOTH legs (token-only until then).
  const forensics = ctx.eventType === "liquidation" ? buildCompoundV2LiqForensics(ctx, coords) : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
