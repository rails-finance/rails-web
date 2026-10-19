// The dollar figures of a Compound V3 Arbitrum wallet read: the page's
// visit totals and per-Comet figures. Every price is a Comet's own
// `getPrice` at the read block; the WETH Comet quotes in ETH, so its figures
// convert at WETH in dollars from the USDC Comet's WETH collateral feed
// (`ethUsd` on the read). A Comet with no conversion has no dollar figures,
// and then neither do the totals.

import { scaleCompoundChainBalance, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";

export interface CompoundArbitrumCometUsd {
  supplyUsd: number | null;
  borrowUsd: number | null;
  collateralUsd: number | null;
  /** Per collateral asset (lowercase address), null where unpriced. */
  collateral: Map<string, number | null>;
}

export interface CompoundArbitrumUsd {
  byComet: Map<string, CompoundArbitrumCometUsd>;
  totals: { supplyUsd: number | null; collateralUsd: number | null; debtUsd: number | null };
}

/** Dollars per unit of the Comet's quote unit, or null where it has none. */
function toUsd(p: CompoundMarketChainResponse, ethUsd: number | undefined): number | null {
  if (p.quoteUnit === "USD") return 1;
  if (p.quoteUnit === "ETH") return ethUsd != null && ethUsd > 0 ? ethUsd : null;
  return null;
}

export function compoundArbitrumUsd(read: CompoundWalletChainResponse): CompoundArbitrumUsd {
  const byComet = new Map<string, CompoundArbitrumCometUsd>();
  const totals = { supplyUsd: 0 as number | null, collateralUsd: 0 as number | null, debtUsd: 0 as number | null };
  const add = (k: keyof typeof totals, v: number | null) => {
    totals[k] = totals[k] == null || v == null ? null : totals[k]! + v;
  };
  for (const p of read.positions) {
    const fx = toUsd(p, read.ethUsd);
    const priced = (units: number, price: number): number | null =>
      units === 0 ? 0 : fx != null && price > 0 ? units * price * fx : null;
    const supplyUsd = priced(scaleCompoundChainBalance(p.supplyBalanceRaw, p.baseDecimals), p.basePrice);
    const borrowUsd = priced(scaleCompoundChainBalance(p.borrowBalanceRaw, p.baseDecimals), p.basePrice);
    const collateral = new Map<string, number | null>();
    let collateralUsd: number | null = 0;
    for (const c of p.collateral) {
      const v = priced(scaleCompoundChainBalance(c.balanceRaw, c.decimals), c.price);
      collateral.set(c.address.toLowerCase(), v);
      collateralUsd = collateralUsd == null || v == null ? null : collateralUsd + v;
    }
    byComet.set(p.comet.toLowerCase(), { supplyUsd, borrowUsd, collateralUsd, collateral });
    add("supplyUsd", supplyUsd);
    add("collateralUsd", collateralUsd);
    add("debtUsd", borrowUsd);
  }
  return { byComet, totals };
}
