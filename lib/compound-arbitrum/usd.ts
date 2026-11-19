// The dollar figures of a Compound V3 wallet read (Arbitrum and Base): the
// page's visit totals, per-Comet figures and the holder strip's legs. Every
// price is a Comet's own `getPrice` at the read block, as shown (six decimals,
// six significant figures under $1); the WETH Comet quotes in ETH, so its
// price is one composed row, getPrice × WETH in dollars, each factor as shown
// (`ethUsd` on the read). Each product is the amount at six decimals × that
// price, to the cent, and each figure the sum of its products (ui-jobs 743).
// A Comet with no conversion has no dollar figures, and then neither do the
// totals.

import { scaleCompoundChainBalance, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import type { CompoundWalletChainResponse } from "@/lib/api/fetch-compound-wallet";
import { shownComposedPrice, shownPrice, shownUsd } from "@/lib/shared/shown-usd";

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

const cents = (v: number): number => Math.round(v * 100) / 100;

/** A Comet's price in dollars as shown, and the ETH factor where it composed
 *  one; null where the Comet has no conversion. */
export function cometUsdPrice(
  p: Pick<CompoundMarketChainResponse, "quoteUnit">,
  price: number,
  ethUsd: number | undefined,
): { usd: number; eth?: { price: number; ethUsd: number } } | null {
  if (!(price > 0)) return null;
  if (p.quoteUnit === "USD") return { usd: shownPrice(price) };
  if (p.quoteUnit === "ETH" && ethUsd != null && ethUsd > 0)
    return { usd: shownComposedPrice(price, ethUsd), eth: { price, ethUsd } };
  return null;
}

/** Every held token at its Comet's price in dollars as shown, keyed by
 *  lowercase address: the `prices` the market pages and the overview read. */
export function cometPricesUsd(
  p: CompoundMarketChainResponse,
  baseToken: string,
  ethUsd: number | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  const base = cometUsdPrice(p, p.basePrice, ethUsd);
  if (base) out[baseToken.toLowerCase()] = base.usd;
  for (const c of p.collateral) {
    const u = cometUsdPrice(p, c.price, ethUsd);
    if (u) out[c.address.toLowerCase()] = u.usd;
  }
  return out;
}

export function compoundArbitrumUsd(read: CompoundWalletChainResponse): CompoundArbitrumUsd {
  const byComet = new Map<string, CompoundArbitrumCometUsd>();
  const totals = { supplyUsd: 0 as number | null, collateralUsd: 0 as number | null, debtUsd: 0 as number | null };
  const add = (k: keyof typeof totals, v: number | null) => {
    totals[k] = totals[k] == null || v == null ? null : cents(totals[k]! + v);
  };
  for (const p of read.positions) {
    const priced = (units: number, price: number): number | null => {
      if (units === 0) return 0;
      const u = cometUsdPrice(p, price, read.ethUsd);
      return u ? shownUsd(units, u.usd) : null;
    };
    const supplyUsd = priced(scaleCompoundChainBalance(p.supplyBalanceRaw, p.baseDecimals), p.basePrice);
    const borrowUsd = priced(scaleCompoundChainBalance(p.borrowBalanceRaw, p.baseDecimals), p.basePrice);
    const collateral = new Map<string, number | null>();
    let collateralUsd: number | null = 0;
    for (const c of p.collateral) {
      const v = priced(scaleCompoundChainBalance(c.balanceRaw, c.decimals), c.price);
      collateral.set(c.address.toLowerCase(), v);
      collateralUsd = collateralUsd == null || v == null ? null : cents(collateralUsd + v);
    }
    byComet.set(p.comet.toLowerCase(), { supplyUsd, borrowUsd, collateralUsd, collateral });
    add("supplyUsd", supplyUsd);
    add("collateralUsd", collateralUsd);
    add("debtUsd", borrowUsd);
  }
  return { byComet, totals };
}
