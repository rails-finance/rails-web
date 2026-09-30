// Whether an amount's USD value shows beside it on the timeline (rails-ops
// reference/lifetime-flows-scrubber.md, "The Display menu's USD values"). The
// Display menu has two switches where a page offers them: "USD for
// stablecoins", off by default, and "USD for other tokens", on. A stablecoin
// is a symbol in the stable-denominated list (`isStableDenominated`,
// lib/aave-v4/asset-class.ts). One priced more than 1% off $1 at the event
// shows its USD value whatever the switch says, so a depeg stays visible; the
// same rule shows a euro stable's or a yield-bearing dollar share's value,
// since neither is worth a dollar. A page without the two switches follows
// the one for other tokens for every amount.

import { isStableDenominated } from "@/lib/aave-v4/asset-class";

/** How far from $1 a stablecoin's price at the event may sit before its USD
 *  value shows anyway. */
export const DEPEG_BAND = 0.01;

export interface UsdSwitches {
  showUsdStable: boolean;
  showUsdOther: boolean;
  /** The page's Display menu offers the two switches. */
  usdSplit: boolean;
}

/** Whether a USD value shows beside `amount` of `symbol`. `amount` is the
 *  token amount the USD value prices (its price is usd ÷ amount). */
export function usdShown(
  sw: UsdSwitches,
  symbol: string | null | undefined,
  usd: number | null | undefined,
  amount: number | string | null | undefined,
): boolean {
  if (!sw.usdSplit || !symbol || !isStableDenominated(symbol)) return sw.showUsdOther;
  if (sw.showUsdStable) return true;
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (usd == null || n == null || !Number.isFinite(n) || n <= 0) return false;
  return Math.abs(usd / n - 1) > DEPEG_BAND;
}
