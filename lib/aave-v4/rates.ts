// Aave V4's rates as the docs state them (ui-jobs 627): "supply APY" and
// "borrow APY" (aave.com/docs/aave-v4/positions/supply, /borrow). The hub
// stores a drawn rate a year (`getAssetDrawnRate`, `UpdateAsset.drawnRate`,
// ray-scaled); Rails's supply rate is derived from it. Every surface shows the
// rate compounded each second over a 365-day year (lib/aave-family/apy.ts),
// which is how the hub's drawn index grows: linearly at the stored rate between
// updates, carried forward at each one (read 12 Nov 2026 at Core WETH, blocks
// 26,401,773 to 26,401,778: equal increments per block, 8,318,126,479,863,594,114
// on a ray index, the stored index × rate × 12 s ÷ 31,536,000). Receipts keep
// the stored rate as their input.

import { aprToApy, APY_FORMULA } from "@/lib/aave-family/apy";
import { AAVE_V4_TERMS } from "@/lib/aave-family/terms";
import { ratePercentText } from "@/lib/shared/rate-percent";

export { APY_FORMULA };
export const V4_RATE = AAVE_V4_TERMS;

/** A stored rate a year (0.05 = 5%) as the APY the pages state. */
export function v4Apy(apr: number): number;
export function v4Apy(apr: number | null | undefined): number | null;
export function v4Apy(apr: number | null | undefined): number | null {
  if (apr == null) return null;
  return aprToApy(apr) ?? apr;
}

/** The APY as a percentage, from the stored rate. */
export const v4ApyText = (apr: number): string => ratePercentText(v4Apy(apr));

/** A stored rate as a receipt's input states it: the fraction a year. */
export const rateFraction = (apr: number): string => apr.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");

/** The compounding the receipts name. */
export const COMPOUNDED = "compounded every second over a 365-day year";
