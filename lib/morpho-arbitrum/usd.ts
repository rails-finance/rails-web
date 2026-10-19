// Dollar figures for a Morpho Blue Arbitrum wallet read. Blue states no USD:
// each market's oracle quotes the collateral in the loan token. Where the Aave
// V3 Arbitrum oracle prices the loan token (read at the same block,
// `MorphoWalletChainResponse.loanUsd`), a market's supply, debt and collateral
// value convert at that one price; elsewhere they stay null. Client-safe.

import type { MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";

export interface MorphoArbitrumMarketUsd {
  supplyUsd: number | null;
  borrowUsd: number | null;
  /** The collateral valued by the market's oracle in the loan token, then in
   *  dollars; null without an oracle price. */
  collateralUsd: number | null;
}

export interface MorphoArbitrumUsd {
  byMarket: Map<string, MorphoArbitrumMarketUsd>;
  /** Sums over the priced markets; null when a held market is unpriced and
   *  nothing is priced. */
  totals: { supplyUsd: number | null; collateralUsd: number | null; debtUsd: number | null };
  /** Held markets whose loan token no USD oracle prices. */
  unpriced: number;
}

export function morphoArbitrumUsd(read: Pick<MorphoWalletChainResponse, "positions" | "loanUsd">): MorphoArbitrumUsd {
  const byMarket = new Map<string, MorphoArbitrumMarketUsd>();
  let supply = 0;
  let coll = 0;
  let debt = 0;
  let priced = 0;
  let unpriced = 0;
  for (const p of read.positions) {
    if (p.chainStale) continue;
    const px = read.loanUsd?.[p.loanToken.toLowerCase()];
    if (px == null || !(px > 0)) {
      unpriced++;
      byMarket.set(p.marketId.toLowerCase(), { supplyUsd: null, borrowUsd: null, collateralUsd: null });
      continue;
    }
    priced++;
    const u: MorphoArbitrumMarketUsd = {
      supplyUsd: p.currentSupply * px,
      borrowUsd: p.currentDebt * px,
      collateralUsd: p.collateral > 0 ? (p.oraclePrice > 0 ? p.collateralValue * px : null) : 0,
    };
    byMarket.set(p.marketId.toLowerCase(), u);
    supply += u.supplyUsd ?? 0;
    debt += u.borrowUsd ?? 0;
    coll += u.collateralUsd ?? 0;
  }
  const none = priced === 0 && unpriced > 0;
  return {
    byMarket,
    totals: { supplyUsd: none ? null : supply, collateralUsd: none ? null : coll, debtUsd: none ? null : debt },
    unpriced,
  };
}
