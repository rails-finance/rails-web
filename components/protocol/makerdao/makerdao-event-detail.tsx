"use client";

// MakerDAO event detail (chain-state tier) — adapter onto the shared
// ChainTruthDetail grid. Human labels (Collateral / Debt) over the raw Vat
// fields, showing the resulting on-chain state after this event; each value is
// the exact Vat slot (ink, and normalized debt art) and traces via <Prov>. The
// art→DAI scaling (art × rate) and any USD live on the position summary.

import type { MakerDAOContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, reconstructTransition, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  inkAfterProv,
  artAfterProv,
  dinkProv,
  dartProv,
  inkBeforeProv,
  artBeforeProv,
  atBlockPriceProv,
  grabSeizedUsdProv,
  grabClearedDaiProv,
  grabCushionProv,
  type MakerCoords,
} from "@/lib/makerdao/event-provenance";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";

export interface MakerDAOEventDetailProps {
  ctx: MakerDAOContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human: string): string => formatNumber(Number(human));

/** The forensics for a grab — Maker's seizure variant of the shared two-leg
 *  block. Seized = |dink| at the ilk's own OSM price recovered at the block
 *  (Vat spot × Spotter mat, mig 111); cleared = |dart| × rate@block, DAI, the
 *  Vat's own unit of account (no price applied). The third stat is a CUSHION,
 *  not a liquidator's bonus: the collateral went to a Dutch auction, where the
 *  penalty is charged and any surplus returns to the owner. Undefined until
 *  the block is priced; the card stays token-only meanwhile. */
function buildGrabForensics(ctx: MakerDAOContext, coords: MakerCoords): LiquidationForensicsProps | undefined {
  const price = ctx.priceAtBlock;
  const rate = ctx.rateAtBlock != null ? Number(ctx.rateAtBlock) : NaN;
  const seizedAmt = Math.abs(Number(ctx.dink));
  const clearedArt = Math.abs(Number(ctx.dart));
  if (!price || !Number.isFinite(rate) || rate <= 0) return undefined;
  if (!Number.isFinite(seizedAmt) || !Number.isFinite(clearedArt) || seizedAmt <= 0 || clearedArt <= 0)
    return undefined;
  const collSym = ctx.collateralSymbol;
  const debtSym = ilkDebtSymbol(ctx.ilk);
  const seizedUsd = seizedAmt * price.usd;
  const clearedDai = clearedArt * (rate / 1e27);
  return {
    seized: {
      symbol: collSym,
      usd: seizedUsd,
      usdProv: grabSeizedUsdProv(collSym, coords, { amount: fmt(String(seizedAmt)), priceUsd: price.usd }),
    },
    cleared: {
      symbol: debtSym,
      usd: clearedDai,
      usdProv: grabClearedDaiProv(coords, {
        amount: fmt(String(clearedArt)),
        dai: `${fmt(String(clearedDai))} ${debtSym}`,
      }),
    },
    premium: seizedUsd / clearedDai - 1,
    premiumProv: grabCushionProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedDai: `${fmt(String(clearedDai))} ${debtSym}`,
    }),
    premiumLabel: "Cushion at seizure",
    pricePills: [
      {
        symbol: collSym,
        priceUsd: price.usd,
        priceProv: atBlockPriceProv(collSym, coords, price.usd),
        note: "OSM at block (spot × mat)",
      },
    ],
  };
}

export function MakerDAOEventDetail({ ctx, txHash, blockNumber }: MakerDAOEventDetailProps) {
  const coords: MakerCoords = { txHash, blockNumber, urn: ctx.urn, ilk: ctx.ilk };

  const stats: ChainTruthStat[] = [
    {
      label: "Collateral",
      value: fmt(ctx.inkAfter),
      symbol: ctx.collateralSymbol,
      prov: inkAfterProv(ctx.collateralSymbol, coords),
      transition: reconstructTransition({
        after: ctx.inkAfter,
        change: ctx.dink,
        changeProv: dinkProv(ctx.collateralSymbol, coords),
        beforeProv: inkBeforeProv(ctx.collateralSymbol, coords),
      }),
    },
    // `artAfter` is normalized debt (Vat art); the debt glyph mirrors the
    // header/summary unit (DAI, or USDS on LockStake urns). Rate-scaled debt
    // is a layer on the summary.
    {
      label: "Debt",
      value: fmt(ctx.artAfter),
      symbol: ilkDebtSymbol(ctx.ilk),
      prov: artAfterProv(coords),
      transition: reconstructTransition({
        after: ctx.artAfter,
        change: ctx.dart,
        changeProv: dartProv(coords),
        beforeProv: artBeforeProv(coords),
      }),
    },
  ];

  const forensics = ctx.eventType === "grab" ? buildGrabForensics(ctx, coords) : undefined;

  return (
    <>
      <ChainTruthDetail stats={stats} />
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
