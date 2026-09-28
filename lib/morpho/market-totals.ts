// A Morpho Blue position's debt and supply at its market's totals.
// ----------------------------------------------------------------------------
// SharesMathLib's conversions: borrow shares to assets rounded up, supply
// shares to assets rounded down, with the virtual asset and shares. The Base
// lane (`replayMorphoRows`) takes each row's totals from rails-server mig 357,
// which replays them from the market's Borrow, Repay, Liquidate, Supply,
// Withdraw and AccrueInterest logs as mig 352 does on Ethereum, and prices the
// position's shares here.

/** SharesMathLib's virtual shares and asset. */
const VIRTUAL_SHARES = BigInt(1_000_000);
const VIRTUAL_ASSETS = BigInt(1);

/** Debt a position's borrow shares stand for: toAssetsUp, as Morpho rounds a
 *  debt against the borrower (MorphoBalancesLib.expectedBorrowAssets). */
export function morphoBorrowAssetsUp(shares: bigint, totalBorrowAssets: bigint, totalBorrowShares: bigint): bigint {
  if (shares <= BigInt(0)) return BigInt(0);
  const d = totalBorrowShares + VIRTUAL_SHARES;
  return (shares * (totalBorrowAssets + VIRTUAL_ASSETS) + d - BigInt(1)) / d;
}

/** Supply a position's supply shares stand for: toAssetsDown, as Morpho
 *  rounds a lender's claim (MorphoBalancesLib.expectedSupplyAssets). */
export function morphoSupplyAssetsDown(shares: bigint, totalSupplyAssets: bigint, totalSupplyShares: bigint): bigint {
  if (shares <= BigInt(0)) return BigInt(0);
  return (shares * (totalSupplyAssets + VIRTUAL_ASSETS)) / (totalSupplyShares + VIRTUAL_SHARES);
}

/** A market's four totals at one point in its log order, raw. */
export interface MorphoMarketTotals {
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
  totalSupplyAssets: bigint;
  totalSupplyShares: bigint;
}

/** The totals from the wire's [tba, tbs, tsa, tss] decimal strings. */
export function morphoTotalsOf(v: readonly string[]): MorphoMarketTotals {
  return {
    totalBorrowAssets: BigInt(v[0]),
    totalBorrowShares: BigInt(v[1]),
    totalSupplyAssets: BigInt(v[2]),
    totalSupplyShares: BigInt(v[3]),
  };
}
