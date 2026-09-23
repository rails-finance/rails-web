import { resolvePrice, type PriceEntry } from "@/lib/aave/prices";
import { pricesHaveLoaded, UNPRICED_DUST_TOKENS } from "@/lib/aave-v4/unpriced";
import type { ReserveStats } from "@/lib/aave-v4/spoke-cards";

/** Lifetime USD totals that mirror the tower chart's breakdown-legend rows
 *  (Deposited / Withdrawn / Liquidated / In Protocol; Borrowed / Repaid /
 *  Liquidated / Outstanding). Lives apart from the chart component so the
 *  footnote narration can quote the exact figures the towers draw without
 *  pulling the whole chart module into the page's initial bundle (the chart
 *  itself is a lazy chunk) — surplus-included always (a lifetime summary
 *  doesn't honour the chart's hide-surplus display toggle). Anchored to
 *  chain-state net balances + flows, matching the reconciled side-bar math in
 *  the chart body.
 *
 *  RULE: Rails never invents a price (rails-ops TO-DO-ui-jobs §40). A holding
 *  whose asset no source prices contributes NO USD leg here; its symbol comes
 *  back in `unpricedSymbols` so the narration that quotes these figures can say
 *  the totals are partial and name what is missing. */
export interface AaveLifetimeTotals {
  depositedUsd: number;
  withdrawnUsd: number;
  liquidatedCollUsd: number;
  inProtocolUsd: number;
  borrowedUsd: number;
  repaidUsd: number;
  liquidatedDebtUsd: number;
  outstandingUsd: number;
  hasDebtHistory: boolean;
  /** Assets with a live balance and no price source — left out of every USD
   *  figure above, so anything that prints one has to name them. */
  unpricedSymbols: string[];
}

export function computeAaveLifetimeTotals(
  reserves: ReserveStats[],
  prices?: Record<string, PriceEntry | number>,
): AaveLifetimeTotals {
  const t: AaveLifetimeTotals = {
    depositedUsd: 0,
    withdrawnUsd: 0,
    liquidatedCollUsd: 0,
    inProtocolUsd: 0,
    borrowedUsd: 0,
    repaidUsd: 0,
    liquidatedDebtUsd: 0,
    outstandingUsd: 0,
    hasDebtHistory: false,
    unpricedSymbols: [],
  };
  // Nothing is known to be unpriced until the price map has answered at all.
  const mapAnswered = pricesHaveLoaded(prices);
  for (const r of reserves) {
    // Current holdings at live price; lifetime outflows at price-at-the-time
    // (accumulated per event upstream). Deposited/Borrowed derive from the two so
    // "Deposited − Withdrawn = In Protocol" still reconciles.
    const price = resolvePrice(r.symbol, prices);
    const netSupply = r.currentSupplied ?? Math.max(0, r.supplied - r.withdrawn - r.liquidatedCollateral);
    const netDebt = r.currentBorrowed ?? Math.max(0, r.borrowed - r.repaid - r.liquidatedDebt);
    // No price, no holding leg. The outflow legs stand: they were valued at the
    // price stored for their own block, which this reserve may well have.
    const inProtocolUsd = price == null ? 0 : netSupply * price;
    const outstandingUsd = price == null ? 0 : netDebt * price;
    if (mapAnswered && price == null && (netSupply > UNPRICED_DUST_TOKENS || netDebt > UNPRICED_DUST_TOKENS)) {
      t.unpricedSymbols.push(r.symbol);
    }
    t.inProtocolUsd += inProtocolUsd;
    t.withdrawnUsd += r.withdrawnUsd;
    t.liquidatedCollUsd += r.liquidatedCollateralUsd;
    t.depositedUsd += inProtocolUsd + r.withdrawnUsd + r.liquidatedCollateralUsd;
    t.outstandingUsd += outstandingUsd;
    t.repaidUsd += r.repaidUsd;
    t.liquidatedDebtUsd += r.liquidatedDebtUsd;
    t.borrowedUsd += outstandingUsd + r.repaidUsd + r.liquidatedDebtUsd;
    if (r.borrowed > 0 || r.repaid > 0 || r.liquidatedDebt > 0) t.hasDebtHistory = true;
  }
  return t;
}
