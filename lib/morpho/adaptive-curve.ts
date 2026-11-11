// Morpho's AdaptiveCurveIRM as a rate curve (ui-jobs 549 step 5): the borrow
// rate against utilisation is the rate at target times a curve that is a
// quarter of it at 0% utilisation, the rate at target at 90%, and four times
// it at 100%. That is the two-slope shape the product shells draw
// (`RateCurveModel`): base r/4, slope r·3/4 up to the 90% target, slope 3r
// past it. The rate at target itself moves with time, up while the market sits
// above the target and down below it, so the curve is the one the IRM holds at
// the read's block: `rateAtTarget(id)` as stored, adapted over the time since
// the market last settled (AdaptiveCurveIrm `_newRateAtTarget`, the same
// arithmetic as lib/vaults/illiquid.ts).
//
// Pure and client-safe.

import { ARBITRUM_CHAIN_ID, ARC_CHAIN_ID, BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { MORPHO_ARBITRUM_IRM } from "@/lib/morpho-arbitrum/asset-catalog";
import { MORPHO_ARC_CONTRACTS } from "@/lib/morpho-arc/types";

/** The AdaptiveCurveIRM on each chain, lowercased. Each answers `MORPHO()`
 *  with its chain's Morpho Blue (read 9 Nov 2026). */
export const MORPHO_ADAPTIVE_CURVE_IRM: Readonly<Record<number, string>> = {
  [MAINNET_CHAIN_ID]: "0x870ac11d48b15db9a138cf899d20f13f79ba00bc",
  [BASE_CHAIN_ID]: "0x46415998764c29ab2a25cbea6254146d50d22687",
  [ARBITRUM_CHAIN_ID]: MORPHO_ARBITRUM_IRM,
  // Arc: Morpho's addresses page, checked on chain 11 Nov 2026.
  [ARC_CHAIN_ID]: MORPHO_ARC_CONTRACTS.adaptiveCurveIrm,
};

export const isAdaptiveCurveIrm = (chainId: number, irm: string | null | undefined): boolean =>
  irm != null && irm.toLowerCase() === MORPHO_ADAPTIVE_CURVE_IRM[chainId];

const YEAR = 31_536_000;
/** ConstantsLib: the curve's steepness, the target, the speed (50 a year) and
 *  the rate at target's bounds (0.1% and 200% a year). */
export const CURVE_STEEPNESS = 4;
export const TARGET_UTILISATION = 0.9;
const ADJUSTMENT_SPEED = 50 / YEAR;
const MIN_RATE_AT_TARGET = 0.001;
const MAX_RATE_AT_TARGET = 2;

const errAt = (u: number) =>
  u > TARGET_UTILISATION
    ? (u - TARGET_UTILISATION) / (1 - TARGET_UTILISATION)
    : (u - TARGET_UTILISATION) / TARGET_UTILISATION;

/** The stored rate at target (per second, WAD, a decimal string) as a yearly
 *  fraction, adapted over `elapsed` seconds at the settled utilisation and
 *  bounded to the IRM's range. */
export function rateAtTargetYearly(stored: string, settledUtilisation: number, elapsed: number): number {
  const yearly = (Number(stored) / 1e18) * YEAR;
  const adapted = yearly * Math.exp(ADJUSTMENT_SPEED * errAt(settledUtilisation) * Math.max(0, elapsed));
  return Math.min(MAX_RATE_AT_TARGET, Math.max(MIN_RATE_AT_TARGET, adapted));
}

/** The borrow rate the curve gives at utilisation `u`, a year. */
export function adaptiveBorrowRate(rateAtTarget: number, u: number): number {
  const err = errAt(u);
  const curve = err < 0 ? (1 - 1 / CURVE_STEEPNESS) * err + 1 : (CURVE_STEEPNESS - 1) * err + 1;
  return rateAtTarget * curve;
}

/** The curve as the shells' two-slope terms. */
export function adaptiveCurveTerms(rateAtTarget: number): {
  optimal: number;
  base: number;
  slope1: number;
  slope2: number;
} {
  return {
    optimal: TARGET_UTILISATION,
    base: rateAtTarget / CURVE_STEEPNESS,
    slope1: rateAtTarget * (1 - 1 / CURVE_STEEPNESS),
    slope2: rateAtTarget * (CURVE_STEEPNESS - 1),
  };
}

/** How long the rate at target takes to double while a market sits at 100%
 *  utilisation, in days: ln 2 over the adjustment speed. */
export const DOUBLING_DAYS_AT_FULL = Math.LN2 / (ADJUSTMENT_SPEED * 86_400);
