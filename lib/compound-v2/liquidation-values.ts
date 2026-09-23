// A Compound V2 liquidation's two legs valued at the market's own oracle price
// captured at the event block (mig 151). Shared by the event card's forensics
// and the CSV export, so the two state the same figures.
//
// NATIVE-ONLY: the legs are denominated in ETH before the oracle migration
// (block 10,678,764) and USD after; `numeraire` says which.

import type { CompoundV2Context } from "@/lib/shared/types/event-shape";
import { COMPOUND_V2_MARKET_BY_KEY } from "@/lib/compound-v2/asset-catalog";

/** Exact-ish raw → float: a BigInt whole/frac split, so a 1e24-scale seized
 *  underlying or a 1e28-scale oracle price survives without Number overflow. */
export function rawToNum(raw: bigint, decimals: number): number {
  if (decimals <= 0) return Number(raw);
  const div = BigInt(10) ** BigInt(decimals);
  return Number(raw / div) + Number(raw % div) / Number(div);
}

export interface CompoundV2LiquidationValues {
  numeraire: "ETH" | "USD";
  seizedUnderlying: number;
  repaid: number;
  collPrice: number;
  debtPrice: number;
  /** seizedUnderlying × collPrice, in `numeraire`. */
  seizedValue: number;
  /** repaid × debtPrice, in `numeraire`. */
  clearedValue: number;
  /** The liquidation incentive at the block, as a fraction (0.08 = 8%). */
  incPct: number;
}

/** Undefined until the price walk has priced BOTH legs at this block. */
export function compoundV2LiquidationValues(ctx: CompoundV2Context): CompoundV2LiquidationValues | undefined {
  const numeraire = ctx.priceNumeraire;
  const debtM = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  const collM = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
  const seizeRaw = ctx.raw?.seizeTokens;
  const repayRaw = ctx.raw?.amount;
  if (
    !numeraire ||
    !debtM ||
    !collM ||
    !seizeRaw ||
    !repayRaw ||
    ctx.collateralPriceNative == null ||
    ctx.debtPriceNative == null ||
    ctx.collateralExchangeRate == null ||
    ctx.incentive == null
  )
    return undefined;

  let seizedUnderlying: number, repaid: number, collPrice: number, debtPrice: number, incPct: number;
  try {
    // Seized cTokens → underlying via the collateral cToken's exchangeRateStored
    // at the block (seizeTokens carries the 8-dp cToken scale; exchangeRate the
    // 1e18), then each side valued at its oracle-at-block getUnderlyingPrice
    // (scaled 1e(36−underlyingDecimals)).
    const underlyingSeizedRaw = (BigInt(seizeRaw) * BigInt(ctx.collateralExchangeRate)) / BigInt(10) ** BigInt(18);
    seizedUnderlying = rawToNum(underlyingSeizedRaw, collM.decimals);
    collPrice = rawToNum(BigInt(ctx.collateralPriceNative), 36 - collM.decimals);
    debtPrice = rawToNum(BigInt(ctx.debtPriceNative), 36 - debtM.decimals);
    repaid = rawToNum(BigInt(repayRaw), debtM.decimals);
    incPct = rawToNum(BigInt(ctx.incentive), 18) - 1;
  } catch {
    return undefined;
  }
  const seizedValue = seizedUnderlying * collPrice;
  const clearedValue = repaid * debtPrice;
  if (!Number.isFinite(seizedValue) || !Number.isFinite(clearedValue) || seizedValue <= 0 || clearedValue <= 0)
    return undefined;
  return { numeraire, seizedUnderlying, repaid, collPrice, debtPrice, seizedValue, clearedValue, incPct };
}
