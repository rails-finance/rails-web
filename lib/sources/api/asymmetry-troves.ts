// Asymmetry troves listing — the `api` arm's presentation transform.
// ----------------------------------------------------------------------------
// The rails-server route (/api/asymmetry/troves) does the structural work — filter,
// sort, paginate over mv_asymmetry_positions — and returns the page slice already
// shaped as the canonical TroveSummary (per-branch decimals applied server-side,
// USD/CR = 0). This builder narrows each backend row to the fields the Asymmetry
// card consumes (branch symbol, scaled collateral + USDaf debt, interest rate,
// batched flag, status), keeps the raw strings for provenance, and — since the
// 2026-07 depth pass — values each row at its branch's OWN PriceFeed (the
// resolved price map the route passes in): oracle USD on the collateral, the
// $1 redemption face on the debt, and the collateral ratio. An unpriced branch
// (RPC down) degrades those fields to null — amounts-only, never a $0.

import { resolveBranch } from "@/lib/asymmetry/asset-catalog";
import type { LiquityForkPriceMap } from "@/lib/sources/chain/liquity-fork-prices";

export type AsymmetryTroveStatus = "open" | "closed" | "liquidated";
/** Backend sort keys (all chain-direct). */
export type AsymmetryTroveSort = "debt" | "coll" | "interestRate" | "lastActivity";

export interface AsymmetryTroveSummary {
  /** Trove NFT id (uint256 string) — unique WITHIN its branch. */
  id: string;
  status: AsymmetryTroveStatus;
  /** Branch display symbol (ysyBOLD | scrvUSD | sUSDS | sfrxUSD | tBTC | WBTC18 | cbBTC18). */
  collateralType: string;
  /** Collateral the Trove currently holds (display units). */
  collateral: number;
  collateralRaw: string;
  /** USDaf debt the Trove currently owes (display units). */
  debt: number;
  debtRaw: string;
  /** Highest recorded collateral / USDaf debt over this Trove's life (display
   *  units) — the route's max over the events MV, real peaks per row. A
   *  closed/liquidated Trove reads 0/0, so its card headlines these. */
  peakCollateral: number;
  peakDebt: number;
  /** Annual interest rate (percent). */
  interestRate: number;
  /** Managed by an interest-batch manager. */
  isBatched: boolean;
  lastActivityAt: number;
  /** The Trove's OWN transactions (distinct tx; redemptions + liquidations
   *  excluded — third parties act in those), from the route's events-MV
   *  counts; the separate counts ride beside it for the meta glyphs. */
  txCount: number;
  liquidationCount: number;
  redemptionCount: number;
  /** Branch oracle price (USD per whole collateral token, the branch's own
   *  PriceFeed via the route's resolved map). Null when unpriced (RPC down). */
  priceUsd: number | null;
  /** True when the price is the feed's lagging lastGoodPrice (the live
   *  fetchPrice simulation failed). */
  priceStale: boolean;
  /** collateral × priceUsd. Null when unpriced. */
  collateralUsd: number | null;
  /** collateral × priceUsd ÷ debt — mirrors the contract's ICR formula
   *  (identity verified BigInt-exact). Null when no debt or unpriced. */
  collateralRatio: number | null;
  /** Current TroveNFT holder (mig 150 ownership MV) — NULL once the trove is
   *  burned/closed; `lastOwner` survives the burn so a closed trove still names
   *  who held it. `ownerEns` resolves web-side and is null until a reverse
   *  resolver lands (the pill degrades to the short address). */
  owner: string | null;
  lastOwner: string | null;
  ownerEns: string | null;
}

/** One backend TroveSummary row, in the subset this builder reads. The rails route
 *  already scaled the display numbers per-branch and kept the raw strings. */
export interface RawAsymmetryTroveRow {
  id: string;
  status: AsymmetryTroveStatus;
  collateralType: string;
  /** Ownership, flat on the backend row (asymmetry route, mig 150). */
  owner: string | null;
  lastOwner: string | null;
  ownerEns: string | null;
  debt: { current: number; currentRaw: string; peak: number };
  collateral: { amount: number; amountRaw: string; peakAmount: number };
  metrics: { interestRate: number };
  activity: {
    lastActivityAt: number;
    transactionCount?: number;
    redemptionCount?: number;
    liquidationCount?: number;
  };
  batch: { isMember: boolean };
}

/** Shape the listing rows from the rails route's page slice. Filtering, sorting and
 *  pagination already happened server-side — order is preserved. `prices` is the
 *  route's per-branch PriceFeed resolution (keyed by branch key); a branch absent
 *  from it leaves the row unpriced. */
export function buildAsymmetryTroveRows(
  raw: RawAsymmetryTroveRow[],
  prices?: LiquityForkPriceMap,
): AsymmetryTroveSummary[] {
  return raw.map((r) => {
    const branch = resolveBranch(r.collateralType);
    const p = branch ? prices?.get(branch.key) : undefined;
    const collateralUsd = p != null && r.collateral.amount > 0 ? r.collateral.amount * p.priceUsd : null;
    return {
      id: r.id,
      status: r.status,
      collateralType: r.collateralType,
      collateral: r.collateral.amount,
      collateralRaw: r.collateral.amountRaw,
      debt: r.debt.current,
      debtRaw: r.debt.currentRaw,
      peakCollateral: r.collateral.peakAmount,
      peakDebt: r.debt.peak,
      interestRate: r.metrics.interestRate,
      isBatched: r.batch.isMember,
      lastActivityAt: r.activity.lastActivityAt,
      txCount: r.activity.transactionCount ?? 0,
      liquidationCount: r.activity.liquidationCount ?? 0,
      redemptionCount: r.activity.redemptionCount ?? 0,
      priceUsd: p?.priceUsd ?? null,
      priceStale: p?.stale ?? false,
      collateralUsd,
      collateralRatio: p != null && r.debt.current > 0 ? (r.collateral.amount * p.priceUsd) / r.debt.current : null,
      owner: r.owner ?? null,
      lastOwner: r.lastOwner ?? null,
      ownerEns: r.ownerEns ?? null,
    };
  });
}
