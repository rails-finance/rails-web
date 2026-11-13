// Pendle's labels in the docs' words (rails-ops ui-jobs 654; decision 0065;
// reference/official-docs/pendle.md, Owner's calls 2 to 13 and 15, all as
// picked on 13 Nov 2026). Receipt field names, CSV columns and routes keep the
// contract's and Rails's names.

import { marketName } from "./format";
import type { PendleMarketTokens } from "./types";

export const PENDLE_WORDS = {
  /** P2: Pendle's Swap page names a trade's rate "Effective Fixed APY". */
  effectiveFixedApy: "Effective Fixed APY",
  effectiveFixedApyTip:
    "Pendle's docs: the fixed APY you are effectively getting from a trade, after price impact and swap fees. Here, each PT buy's rate, weighted by the PT bought.",
  tradeApyTip:
    "Pendle's docs: the fixed APY you are effectively getting from this trade, after price impact and swap fees.",
  noPtHeld: "no PT held",
  /** P3: the token a market splits; "YT" alone is the Yield Token. */
  yieldBearingToken: "Yield-bearing token",
  /** P6: the docs' consumer pages call a YT's earnings yield. */
  unclaimedYield: "Unclaimed yield",
  /** P7. */
  liquidity: "Liquidity",
  /** P8. */
  ytPrice: "YT price",
  lpPrice: "LP price",
  syRate: "SY exchange rate",
  /** An empty pool's implied APY (the desk's pick). */
  noLiquidity: "no liquidity",
  /** P13: the AMM page's list of what an LP earns. */
  lpEarns:
    "By Pendle's AMM page, LP earns PT fixed yield, underlying yield (SY yield), swap fees and PENDLE incentives.",
} as const;

/** P9: the LP's one spelling, "LP stETH-30DEC2027". */
export const lpName = (t: PendleMarketTokens) => `LP ${marketName(t)}`;

/** P9: the on-chain symbol, for a tip beside the LP's name. */
export const LP_SYMBOL_NOTE = "On chain the LP token's symbol is PENDLE-LPT.";

/** P4: the market title in the docs' form, the accounting asset in brackets (market page only). */
export const marketTitleWithAsset = (name: string, asset: string) => `${name} (${asset})`;

/**
 * An empty pool: its liquidity in SY is under 0.000001 SY (the smallest figure
 * Rails prints, "<0.000001"). Read from the roster's and the market page's
 * `tvl.sy`; no chain call. Such a pool's implied APY is the rate its last trade
 * stored (rails-ops reference/official-docs/pendle.md, Read on chain 2), so
 * Rails shows none.
 */
export function emptyPool(tvl: { sy: string } | null | undefined, syDecimals: number | null): boolean {
  if (tvl == null || syDecimals == null) return false;
  try {
    return BigInt(tvl.sy) < BigInt(10) ** BigInt(Math.max(syDecimals - 6, 0));
  } catch {
    return false;
  }
}
