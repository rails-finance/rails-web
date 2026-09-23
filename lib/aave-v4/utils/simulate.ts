/**
 * Pure multi-asset simulator for an Aave V4 spoke position.
 *
 * Aave's health factor is:
 *   HF = Σ(coll_i × price_i × LT_i) / Σ(debt_j × price_j)
 * where `coll_i` only counts reserves the user has enabled as collateral
 * (a per-reserve on-chain flag). Reserves with LT = 0 don't contribute, so
 * stables listed borrow-only are correctly ignored.
 *
 * Per-asset liquidation prices are derived by solving HF = 1 while holding
 * every *other* asset's state constant:
 *   p_i_liq = (totalDebtUsd − weightedOtherCollUsd) / (coll_i × LT_i)
 * Negative outputs mean the rest of the collateral already over-covers the
 * debt — the asset in question can go to zero without liquidating.
 */

export interface SimSupply {
  symbol: string;
  amount: number;
  price: number;
  lt: number;
  /** Matches on-chain `useAsCollateral` flag. When false the supply still
   *  earns yield but contributes nothing to HF. */
  collateralEnabled: boolean;
}

export interface SimDebt {
  symbol: string;
  amount: number;
  price: number;
}

export interface SimPositionInputs {
  supplies: SimSupply[];
  debts: SimDebt[];
}

export interface SimAssetLiqPrice {
  symbol: string;
  currentPrice: number;
  /** Price at which HF hits 1, with all other assets held at current state.
   *  null when liq is unreachable (e.g. position already over-collateralised
   *  without this asset) or the asset doesn't contribute to HF. */
  liqPrice: number | null;
  /** (currentPrice − liqPrice) / currentPrice × 100, or null when liqPrice null. */
  headroomPct: number | null;
}

export interface SimResult {
  totalCollateralUsd: number;
  totalDebtUsd: number;
  /** Σ(coll_i × price_i × LT_i) — the numerator of HF before dividing. */
  weightedCollateralUsd: number;
  /** weightedCollateralUsd / totalCollateralUsd — effective LT with current mix. */
  weightedLt: number | null;
  /** HF = weightedCollateralUsd / totalDebtUsd. null when debt is zero. */
  healthFactor: number | null;
  /** Max new borrow in USD before HF = 1, given current weighted collateral. */
  borrowCapacityUsd: number;
  /** Per-collateral-asset liquidation price (shock only that asset). */
  assetLiqPrices: SimAssetLiqPrice[];
  /** True when HF < 1 — on-chain the position would already be liquidatable. */
  underwater: boolean;
}

export interface SupplyBreakdown {
  /** Σ USD of supplies the user has ENABLED as collateral — what actually backs
   *  the loan and can be seized in a liquidation. This is the honest "Collateral"
   *  figure. */
  collateralUsd: number;
  collateralSymbols: string[];
  /** Σ USD of supplies NOT enabled as collateral — real holdings earning yield,
   *  but never seized in a liquidation and absent from the health factor (see
   *  Aave V4 liquidation mechanics). Shown separately, never counted as
   *  collateral. */
  nonCollateralUsd: number;
  nonCollateralSymbols: string[];
}

/**
 * Split a position's supplies into collateral vs non-collateral by the on-chain
 * `useAsCollateral` flag. A supplied-but-not-collateral asset doesn't back the
 * loan, doesn't move the health factor, and can't be seized — so it must not be
 * counted in the headline "Collateral".
 */
export function computeSupplyBreakdown(supplies: SimSupply[]): SupplyBreakdown {
  const out: SupplyBreakdown = {
    collateralUsd: 0,
    collateralSymbols: [],
    nonCollateralUsd: 0,
    nonCollateralSymbols: [],
  };
  for (const s of supplies) {
    if (s.amount <= 0) continue;
    const usd = s.amount * s.price;
    if (s.collateralEnabled) {
      out.collateralUsd += usd;
      out.collateralSymbols.push(s.symbol);
    } else {
      out.nonCollateralUsd += usd;
      out.nonCollateralSymbols.push(s.symbol);
    }
  }
  return out;
}

export function simulateAaveV4Position({ supplies, debts }: SimPositionInputs): SimResult {
  let totalCollateralUsd = 0;
  let weightedCollateralUsd = 0;
  for (const s of supplies) {
    const usd = s.amount * s.price;
    totalCollateralUsd += usd;
    if (s.collateralEnabled && s.lt > 0) {
      weightedCollateralUsd += usd * s.lt;
    }
  }

  let totalDebtUsd = 0;
  for (const d of debts) totalDebtUsd += d.amount * d.price;

  const weightedLt = totalCollateralUsd > 0 ? weightedCollateralUsd / totalCollateralUsd : null;
  const healthFactor = totalDebtUsd > 0 ? weightedCollateralUsd / totalDebtUsd : null;
  const borrowCapacityUsd = Math.max(0, weightedCollateralUsd - totalDebtUsd);
  const underwater = totalDebtUsd > 0 && weightedCollateralUsd < totalDebtUsd;

  const assetLiqPrices: SimAssetLiqPrice[] = supplies.map((s) => {
    if (!s.collateralEnabled || s.lt <= 0 || s.amount <= 0 || totalDebtUsd <= 0) {
      return { symbol: s.symbol, currentPrice: s.price, liqPrice: null, headroomPct: null };
    }
    const contrib = s.amount * s.price * s.lt;
    const otherWeighted = weightedCollateralUsd - contrib;
    const needed = totalDebtUsd - otherWeighted;
    if (needed <= 0) {
      // Position over-covered by the rest of the collateral; this asset can
      // fall to zero without liquidation.
      return { symbol: s.symbol, currentPrice: s.price, liqPrice: 0, headroomPct: 100 };
    }
    const liqPrice = needed / (s.amount * s.lt);
    const headroomPct = s.price > 0 ? ((s.price - liqPrice) / s.price) * 100 : null;
    return { symbol: s.symbol, currentPrice: s.price, liqPrice, headroomPct };
  });

  return {
    totalCollateralUsd,
    totalDebtUsd,
    weightedCollateralUsd,
    weightedLt,
    healthFactor,
    borrowCapacityUsd,
    assetLiqPrices,
    underwater,
  };
}
