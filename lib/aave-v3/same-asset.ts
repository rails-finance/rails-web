// A V3-family account whose every supplied and every borrowed reserve is one
// token. Both sides of its health factor are priced by that token's one oracle
// feed, so the price cancels: HF = supplied × LT ÷ owed, in tokens. Only the
// two interest rates move it, at about (supply APR − borrow APR) a year in
// log terms. The card and its explanation state that in place of a
// liquidation price (the view-side twin of this rule is
// aaveV3SameAssetOfView in chain-truth-tower.ts).
//
// Client-safe.

import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";

export interface AaveV3SameAsset {
  symbol: string;
  address: string;
  /** Supply and borrow APR at the read (0..1), where the read carried them. */
  supplyApr: number | null;
  borrowApr: number | null;
  /** Yearly change of the health factor from the rates alone (−0.0008 = falls
   *  0.08% a year). Null without both rates. */
  hfDriftPerYear: number | null;
  /** Years to HF 1 at today's rates, where it is falling from above 1. */
  yearsToOne: number | null;
}

export function aaveV3SameAsset(chain: AaveV3PositionChainResponse): AaveV3SameAsset | null {
  const s = chain.reserves.filter((r) => r.supplyBalanceRaw !== "0");
  const d = chain.reserves.filter((r) => r.debtBalanceRaw !== "0");
  if (s.length !== 1 || d.length !== 1 || s[0].address.toLowerCase() !== d[0].address.toLowerCase()) return null;
  const r = s[0];
  const supplyApr = typeof r.supplyApr === "number" ? r.supplyApr : null;
  const borrowApr = typeof r.borrowApr === "number" ? r.borrowApr : null;
  const drift = supplyApr != null && borrowApr != null ? supplyApr - borrowApr : null;
  const hf = chain.healthFactor;
  const yearsToOne = drift != null && drift < 0 && hf != null && hf > 1 ? Math.log(hf) / -drift : null;
  return {
    symbol: r.symbol,
    address: r.address.toLowerCase(),
    supplyApr,
    borrowApr,
    hfDriftPerYear: drift,
    yearsToOne,
  };
}
