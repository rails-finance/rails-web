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
import type {
  LiquityForkCoords,
  LiquityForkForensicsVocab,
  LiquityForkLiquidationLeg,
} from "@/lib/shared/liquity-fork-provenance";
import type { LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import type { ChainTruthStat } from "@/components/shared/chain-truth-event";
import type { Provenance } from "@/components/shared/provenance";
import { forkAmount, forkCollAmount, forkCollMove, forkDebtMove, forkFeeAmount } from "@/lib/shared/liquity-fork-ops";
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

type LegProv = (coords: LiquityForkCoords, vals: { leg: LiquityForkLiquidationLeg; amount: string }) => Provenance;

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
  const coll = ctx.collateralSymbol;
  const pct = (f: number | undefined) => (f != null ? `${Math.round(f * 1000) / 10}%` : null);
  // Where the debt went, each leg with the collateral that went with it and
  // the branch's penalty on it.
  if (Number(liq.debtOffsetBySP) > 0)
    stats.push({
      label: "Stability Pool absorbed",
      value: forkAmount(Number(liq.debtOffsetBySP)),
      symbol: debtSymbol,
      prov: liquidationLegProv(coords, { leg: "offset", amount: liq.debtOffsetBySP }),
      ...(Number(liq.collSentToSP) > 0
        ? {
            sub: `for ${forkCollAmount(Number(liq.collSentToSP))} ${coll}${pct(liq.penaltySp) ? ` (debt + ${pct(liq.penaltySp)} penalty)` : ""}`,
          }
        : {}),
    });
  if (Number(liq.debtRedistributed) > 0)
    stats.push({
      label: "Redistributed",
      value: forkAmount(Number(liq.debtRedistributed)),
      symbol: debtSymbol,
      prov: liquidationLegProv(coords, { leg: "redistributed", amount: liq.debtRedistributed }),
      ...(Number(liq.collRedistributed) > 0
        ? {
            sub: `with ${forkCollAmount(Number(liq.collRedistributed))} ${coll}${pct(liq.penaltyRedist) ? ` (debt + ${pct(liq.penaltyRedist)} penalty)` : ""}`,
          }
        : {}),
    });
  // The collateral taken is the Trove's whole collateral less the surplus,
  // which is the owner's and stands on its own line.
  const whole = Math.abs(forkCollMove(ctx));
  const surplus = Number(liq.collSurplus);
  if (whole > 0 && surplus > 0)
    stats.push({
      label: "Collateral taken",
      value: forkCollAmount(whole - surplus),
      symbol: coll,
      prov: {
        kind: "derived",
        summary: `Collateral taken by the liquidation — the Trove's whole collateral less the surplus that came back to the owner: what went to the Stability Pool, the branch's other Troves and the liquidator.`,
        formula: "collateral before − surplus",
        inputs: [
          { label: "collateral before", value: forkCollAmount(whole), kind: "chain" },
          { label: "surplus", value: forkCollAmount(surplus), kind: "chain", pclass: "emitted", note: "_collSurplus" },
        ],
      },
      ...(Number(liq.collGasCompensation) > 0
        ? { sub: `incl. ${forkCollAmount(Number(liq.collGasCompensation))} to the liquidator` }
        : {}),
    });
  if (surplus > 0)
    stats.push({
      label: "Surplus for the owner",
      value: forkCollAmount(surplus),
      symbol: coll,
      prov: liquidationLegProv(coords, { leg: "surplus", amount: liq.collSurplus }),
      sub: "claimable by the owner (surplus pool)",
    });
  return stats;
}

type RedemptionProvs = {
  emittedRedemptionPriceProv: (coords: LiquityForkCoords, priceUsd: number) => Provenance;
  redemptionFeeKeptProv: (coords: LiquityForkCoords, vals: { fee: string }) => Provenance;
  redemptionActProv: (coords: LiquityForkCoords, vals: { actual: string; attempted: string }) => Provenance;
};

/** A redemption's own facts on the opened grid: the price the branch acted
 *  at (emitted with the act), the fee the redeemer left in this Trove as an
 *  amount and a share of the collateral redeemed from it, and the whole
 *  branch-wide redemption with this Trove's part of it. The debt cleared and
 *  the collateral sent are this Trove's own (the Debt and Collateral cells). */
export function forkRedemptionStats(
  ctx: LiquityForkForensicsContext,
  coords: LiquityForkCoords,
  p: RedemptionProvs,
  debtSymbol: string,
): ChainTruthStat[] {
  const red = ctx.redemption;
  if (ctx.eventType !== "redeemCollateral" || !red) return [];
  const stats: ChainTruthStat[] = [];
  const emitted = ctx.priceAtBlock?.source === "redemption-event-price" ? ctx.priceAtBlock.usd : null;
  if (emitted != null)
    stats.push({
      label: "Branch price",
      value: formatUsdValue(emitted),
      symbol: "",
      prov: p.emittedRedemptionPriceProv(coords, emitted),
    });
  const fee = Number(red.feeKeptColl);
  const collOut = Math.abs(forkCollMove(ctx));
  if (fee > 0)
    stats.push({
      label: "Fee kept",
      value: forkFeeAmount(fee),
      display: forkFeeAmount(fee),
      symbol: ctx.collateralSymbol,
      prov: p.redemptionFeeKeptProv(coords, { fee: red.feeKeptColl }),
      ...(collOut > 0 ? { sub: `${((fee / (collOut + fee)) * 100).toFixed(2)}% of the collateral redeemed` } : {}),
    });
  const own = Math.abs(forkDebtMove(ctx).value);
  const actual = Number(red.actual);
  stats.push({
    label: "Whole redemption",
    value: forkAmount(actual),
    symbol: debtSymbol,
    prov: p.redemptionActProv(coords, { actual: red.actual, attempted: red.attempted }),
    sub: Math.abs(own - actual) <= 0.01 ? "all from this Trove" : `this Trove ${((own / actual) * 100).toFixed(2)}%`,
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
    // Seized over cleared on the whole Trove is its collateral ratio at
    // liquidation; the surplus that came back and where the rest went are the
    // grid's own lines.
    seizedLabel: "Collateral, at liquidation",
    premiumLabel: "Collateral ratio at liquidation",
    premiumAsRatio: true,
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
