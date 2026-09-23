"use client";

// Moonwell event detail — adapter onto the shared ChainTruthDetail grid. The
// lanes an event touches, with before→after transitions:
//   mint/redeem  — the supply PRINCIPAL lane (replayed, amounts-only) AND the
//                  mToken lane (slot-exact Transfer replay) side by side; the
//                  two bases are the point, each traced to its own class.
//   borrow/repay — the debt lane: after = the EMITTED accountBorrows (interest
//                  to this moment included), before = ∓ the event's own amount.
//   transfers    — the mToken lane (a position can arrive or leave by transfer).
//   liquidation  — the debt repaid + the collateral-market mTokens seized (the
//                  balance movements live on the paired repay/transfer rows),
//                  and beneath them the valued two-leg breakdown at the
//                  Comptroller's own oracle read at the block (mig 195) once
//                  the filler has priced it — token-only until then.
//   every row    — the event market's oracle-at-block price as a footnote
//                  pill when the index carries it.

import type { MoonwellContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import {
  AtBlockPriceFootnote,
  LiquidationForensics,
  type LiquidationForensicsProps,
} from "@/components/shared/liquidation-forensics";
import {
  assetsDeltaProv,
  mTokensDeltaProv,
  transferAmountProv,
  accountBorrowsProv,
  debtBeforeProv,
  seizeTokensProv,
  liqDebtRepaidProv,
  supplyAfterProv,
  supplyBeforeProv,
  mTokensAfterProv,
  mTokensBeforeProv,
  atBlockPriceProv,
  liqSeizedValueProv,
  liqClearedValueProv,
  liqPremiumProv,
  liqIncentiveRefProv,
  type MoonwellCoords,
} from "@/lib/moonwell/event-provenance";
import { useMoonwellCoords, useMoonwellDeployment } from "@/lib/moonwell/deployment-context";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface MoonwellEventDetailProps {
  ctx: MoonwellContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Number(human)));

/**
 * The valued two-leg liquidation breakdown at the Comptroller's OWN oracle
 * price captured at the event block (mig 195): the seized mTokens converted
 * through the collateral mToken's exchange rate at the block and valued at
 * that market's price, over the covered debt at its market's price. The
 * premium is a ratio of two same-block legs and reproduces the liquidation
 * incentive read at the same block (the self-audit beneath it).
 *
 * Undefined until the filler has priced BOTH legs at this block — the card
 * stays token-only meanwhile (partial fill is a safe state, and a half-valued
 * breakdown would invite a cross-leg comparison the data can't support).
 */
function buildMoonwellLiqForensics(
  ctx: MoonwellContext,
  coords: MoonwellCoords,
  comptroller: string,
): LiquidationForensicsProps | undefined {
  const repaid = ctx.assetsDelta != null ? Math.abs(Number(ctx.assetsDelta)) : NaN;
  const seized = ctx.seizedUnderlyingAtBlock != null ? Number(ctx.seizedUnderlyingAtBlock) : NaN;
  const collPrice = ctx.collateralPriceAtBlock?.usd;
  const debtPrice = ctx.priceAtBlock?.usd;
  if (
    !Number.isFinite(repaid) ||
    !Number.isFinite(seized) ||
    collPrice == null ||
    debtPrice == null ||
    ctx.incentiveAtBlock == null ||
    !ctx.collateralSymbol
  )
    return undefined;
  const seizedValue = seized * collPrice;
  const clearedValue = repaid * debtPrice;
  if (!Number.isFinite(seizedValue) || !Number.isFinite(clearedValue) || seizedValue <= 0 || clearedValue <= 0)
    return undefined;
  const collSym = ctx.collateralSymbol;
  const debtSym = ctx.marketSymbol;
  return {
    seized: {
      symbol: collSym,
      usd: seizedValue,
      usdProv: liqSeizedValueProv(collSym, coords, {
        amount: `${formatNumber(seized)} ${collSym}`,
        price: formatNumber(collPrice),
      }),
    },
    cleared: {
      symbol: debtSym,
      usd: clearedValue,
      usdProv: liqClearedValueProv(debtSym, coords, {
        amount: `${formatNumber(repaid)} ${debtSym}`,
        price: formatNumber(debtPrice),
      }),
    },
    premium: seizedValue / clearedValue - 1,
    premiumProv: liqPremiumProv(coords, { seized: formatUsdValue(seizedValue), cleared: formatUsdValue(clearedValue) }),
    premiumReference: {
      label: "Incentive at block",
      value: `+${((ctx.incentiveAtBlock - 1) * 100).toFixed(2)}%`,
      prov: liqIncentiveRefProv(coords, comptroller, ctx.raw?.incentiveRaw),
    },
    pricePills: [
      {
        symbol: collSym,
        priceUsd: collPrice,
        priceProv: atBlockPriceProv(collSym, coords, ctx.oracleAtBlock, ctx.raw?.collateralPriceRaw),
        note: "oracle at block",
      },
      {
        symbol: debtSym,
        priceUsd: debtPrice,
        priceProv: atBlockPriceProv(debtSym, coords, ctx.oracleAtBlock, ctx.raw?.priceRaw),
        note: "oracle at block",
      },
    ],
  };
}

export function MoonwellEventDetail({ ctx, txHash, blockNumber, wallet }: MoonwellEventDetailProps) {
  const dep = useMoonwellDeployment();
  const coords = useMoonwellCoords({ market: ctx.market, symbol: ctx.marketSymbol, txHash, blockNumber, wallet });
  const mSym = coords.marketLabel ?? `m${ctx.marketSymbol}`;
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
      label: "mToken balance",
      value: fmt(ctx.mTokensAfter),
      symbol: mSym,
      prov: mTokensAfterProv(mSym, coords, ctx.raw?.mTokensAfter),
      transition: reconstructTransition({
        after: ctx.mTokensAfter,
        change: ctx.mTokensDelta,
        changeProv: mTokensDeltaProv(mSym, ctx.eventType, coords, ctx.raw?.mTokens),
        beforeProv: mTokensBeforeProv(mSym, coords),
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
      label: "mToken balance",
      value: fmt(ctx.mTokensAfter),
      symbol: mSym,
      prov: mTokensAfterProv(mSym, coords, ctx.raw?.mTokensAfter),
      transition: reconstructTransition({
        after: ctx.mTokensAfter,
        change: ctx.mTokensDelta,
        changeProv: transferAmountProv(mSym, ctx.eventType === "transfer_in" ? "in" : "out", coords, ctx.raw?.mTokens),
        beforeProv: mTokensBeforeProv(mSym, coords),
      }),
    });
  } else if (ctx.eventType === "liquidation") {
    const collMSym = ctx.collateralMarket
      ? dep.market(ctx.collateralMarket, ctx.collateralSymbol).mSymbol
      : ctx.collateralSymbol
        ? `m${ctx.collateralSymbol}`
        : "—";
    // No transitions here: the debt movement lands in the paired RepayBorrow
    // row and the seize in the paired transfer rows — this row carries the
    // liquidation's own emitted facts.
    stats.push({
      label: "Debt repaid",
      value: fmt(ctx.assetsDelta != null ? String(Math.abs(Number(ctx.assetsDelta))) : undefined),
      symbol: ctx.marketSymbol,
      prov: liqDebtRepaidProv(ctx.marketSymbol, coords, ctx.raw?.amount),
    });
    stats.push({
      label: "Collateral seized",
      value: fmt(ctx.seizeTokens),
      symbol: collMSym,
      prov: seizeTokensProv(collMSym, coords, ctx.raw?.seizeTokens),
    });
  }

  // The valued two-leg breakdown beneath the grid once BOTH legs are priced
  // at the block; an ordinary row shows its market's price as a footnote.
  const forensics =
    ctx.eventType === "liquidation" ? buildMoonwellLiqForensics(ctx, coords, dep.comptroller.address) : undefined;
  const footnote =
    !forensics && ctx.priceAtBlock
      ? [
          {
            symbol: ctx.marketSymbol,
            priceUsd: ctx.priceAtBlock.usd,
            priceProv: atBlockPriceProv(ctx.marketSymbol, coords, ctx.oracleAtBlock, ctx.raw?.priceRaw),
            note: "oracle at block",
          },
        ]
      : [];

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
      {footnote.length > 0 && (
        <div className="px-5 pb-2">
          <AtBlockPriceFootnote pills={footnote} />
        </div>
      )}
    </>
  );
}
