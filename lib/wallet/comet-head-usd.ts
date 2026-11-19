// A Compound V3 position's dollars from the wallet's head read (ui-jobs 738):
// collateral and debt both at the Comet's head prices, an ETH-quoted Comet's
// converted through the same read's WETH price (`ethUsd`), so no stored figure
// sits beside a head one. Pure, for lib/wallet/families/compound.ts.

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
  const toUsd = live.quoteUnit === "USD" ? 1 : (ethUsd ?? undefined);
  const collateralUsd =
    toUsd == null
      ? undefined
      : live.collateral.reduce((sum, c) => sum + scaled(c.balanceRaw, c.decimals) * c.price, 0) * toUsd;
  // Nothing borrowed is no debt, priced or not.
  const debtUsd = borrowed === 0 ? 0 : toUsd == null ? undefined : borrowed * live.basePrice * toUsd;
  return { collateralUsd, debtUsd, borrowed };
}
