// Whole-trove liquidation forensics for the Liquity V2 forks (Ebisu, Asymmetry)
// — the fork analogue of the Liquity V1 whole-trove block, shared because the
// two forks are structural twins.
//
// This family liquidates the WHOLE trove, so the legs are the trove's ENTIRE
// collateral and debt entering the event (the previous emitted update's
// absolutes, carried on the context as collBefore/debtBefore): the branch's
// collateral valued at the branch's own PriceFeed price captured at the block
// (mig 113), the stablecoin at the $1 redemption face the protocol's own ICR
// math uses. The premium is therefore exactly the ICR at fire − 100% — what
// the branch's Stability Pool (or the redistributed troves) realized.
// Undefined until the block is priced; the card stays token-only meanwhile.

import type { EbisuContext, AsymmetryContext, BasedollarContext } from "@/lib/shared/types/event-shape";
import type { LiquityForkCoords, LiquityForkForensicsVocab } from "@/lib/shared/liquity-fork-provenance";
import type { LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import type { ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { Provenance } from "@/components/shared/provenance";
import { forkDebtMove } from "@/lib/shared/liquity-fork-ops";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

/** Any fork's context — structural twins for this purpose. */
export type LiquityForkForensicsContext = EbisuContext | AsymmetryContext | BasedollarContext;

/** The debt a liquidation cleared: the liquidation's own TroveOperation figure
 *  (the whole debt, interest since the previous change included) where the read
 *  path carries it, else the debt logged at the previous change. */
export function forkLiquidationCleared(ctx: LiquityForkForensicsContext): {
  amount: number;
  amountText: string;
  fromOperation: boolean;
} {
  const move = forkDebtMove(ctx);
  if (move.fromOperation && Math.abs(move.value) > 0) {
    const abs = Math.abs(move.value);
    return { amount: abs, amountText: ctx.operation!.debtFromOperation.replace(/^-/, ""), fromOperation: true };
  }
  return { amount: Number(ctx.debtBefore), amountText: ctx.debtBefore, fromOperation: false };
}

type LegProv = (
  coords: LiquityForkCoords,
  vals: { leg: "offset" | "redistributed" | "surplus"; amount: string },
) => Provenance;

/** The Liquidation log's legs as detail-grid stats — where the debt went (the
 *  Stability Pool, the other Troves) and the collateral surplus left for the
 *  owner. These are the receipts the liquidation prose echoes; values are
 *  formatted with the same formatNumber the prose uses. Empty where the read
 *  path carries no Liquidation log for the event. */
export function forkLiquidationStats(
  ctx: LiquityForkForensicsContext,
  coords: LiquityForkCoords,
  liquidationLegProv: LegProv,
  debtSymbol: string,
): ChainTruthStat[] {
  const liq = ctx.liquidation;
  if (ctx.eventType !== "liquidate" || !liq) return [];
  const stats: ChainTruthStat[] = [];
  if (Number(liq.debtOffsetBySP) > 0)
    stats.push({
      label: "Stability Pool absorbed",
      value: formatNumber(Number(liq.debtOffsetBySP)),
      symbol: debtSymbol,
      prov: liquidationLegProv(coords, { leg: "offset", amount: liq.debtOffsetBySP }),
    });
  if (Number(liq.debtRedistributed) > 0)
    stats.push({
      label: "Redistributed",
      value: formatNumber(Number(liq.debtRedistributed)),
      symbol: debtSymbol,
      prov: liquidationLegProv(coords, { leg: "redistributed", amount: liq.debtRedistributed }),
    });
  if (Number(liq.collSurplus) > 0)
    stats.push({
      label: "Surplus for the owner",
      value: formatNumber(Number(liq.collSurplus)),
      symbol: ctx.collateralSymbol,
      prov: liquidationLegProv(coords, { leg: "surplus", amount: liq.collSurplus }),
    });
  return stats;
}

export function buildForkLiquidationForensics(
  ctx: LiquityForkForensicsContext,
  coords: LiquityForkCoords,
  vocab: LiquityForkForensicsVocab,
  opts: { stablecoin: string },
): LiquidationForensicsProps | undefined {
  const price = ctx.priceAtBlock;
  const seizedAmt = Number(ctx.collBefore);
  const cleared = forkLiquidationCleared(ctx);
  const clearedAmt = cleared.amount;
  if (!price || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || seizedAmt <= 0 || clearedAmt <= 0)
    return undefined;
  const coll = ctx.collateralSymbol;
  const seizedUsd = seizedAmt * price.usd;
  const clearedUsd = clearedAmt; // $1 redemption face — the protocol's own ICR denominator
  return {
    seized: {
      symbol: coll,
      usd: seizedUsd,
      usdProv: vocab.liqSeizedUsdProv(coords, { amount: `${ctx.collBefore} ${coll}`, priceUsd: price.usd }),
    },
    cleared: {
      symbol: opts.stablecoin,
      usd: clearedUsd,
      usdProv: vocab.liqClearedFaceProv(coords, {
        amount: `${cleared.amountText} ${opts.stablecoin}`,
        fromOperation: cleared.fromOperation,
      }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: vocab.liqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
      // The minimum in force at this block — governance can move it since.
      mcrPct: ctx.mcrAtEvent != null ? Math.round(ctx.mcrAtEvent * 1000) / 10 : undefined,
    }),
    pricePills: [
      {
        symbol: coll,
        priceUsd: price.usd,
        priceProv: vocab.atBlockPriceProv(coords, price.usd),
        note: "PriceFeed at block",
      },
    ],
  };
}
