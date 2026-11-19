// A Compound V3 position's dollars from the wallet's head read (ui-jobs 738):
// collateral and debt both at the Comet's head prices, an ETH-quoted Comet's
// converted through the same read's WETH price (`ethUsd`), so no stored figure
// sits beside a head one. Pure, for lib/wallet/families/compound.ts.

import { cometUsdPrice } from "@/lib/compound/comet-usd";
import { shownUsd } from "@/lib/shared/shown-usd";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { scaled } from "@/lib/wallet/summary-row";

type CometHead = Pick<
  CompoundMarketChainResponse,
  "quoteUnit" | "collateral" | "borrowBalanceRaw" | "baseDecimals" | "basePrice"
>;

/** `live` absent: a Comet the sweep found empty, holding nothing at head.
 *  A figure is undefined where the ETH-quoted Comet has no WETH price. */
export function cometHeadUsd(
  live: CometHead | undefined,
  ethUsd: number | null | undefined,
): { collateralUsd?: number; debtUsd?: number; borrowed: number } {
  if (!live) return { collateralUsd: 0, debtUsd: 0, borrowed: 0 };
  const borrowed = scaled(live.borrowBalanceRaw, live.baseDecimals);
  // Each asset's shown product at its Comet's price as shown, an ETH-quoted
  // Comet's composed (lib/compound/comet-usd.ts), the sum to the cent: the
  // card's and the strip's figures (ui-jobs 743).
  const usdOf = (amount: number, price: number): number | undefined => {
    if (amount === 0) return 0;
    const u = cometUsdPrice(live, price, ethUsd ?? undefined);
    return u ? shownUsd(amount, u.usd) : undefined;
  };
  let collateralUsd: number | undefined = 0;
  for (const c of live.collateral) {
    const v = usdOf(scaled(c.balanceRaw, c.decimals), c.price);
    collateralUsd = collateralUsd == null || v == null ? undefined : Math.round((collateralUsd + v) * 100) / 100;
  }
  // Nothing borrowed is no debt, priced or not.
  const debtUsd = borrowed === 0 ? 0 : usdOf(borrowed, live.basePrice);
  return { collateralUsd, debtUsd, borrowed };
}
