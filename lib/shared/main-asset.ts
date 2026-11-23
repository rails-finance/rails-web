// A closed account side's main asset (rails-ops ui-jobs 803): the asset the
// head leads with, in its own token, on the listing row and the position page
// alike. Both surfaces pass the same inputs (each asset's highest recorded
// amount and the row's price for it, as the position listing serves them), so
// both pick the same asset. The pick is the largest by value: amount × price.
// An asset with no price, or whose decimals did not load, is not a candidate;
// a tie keeps the side's first. Imports nothing, so scripts/test reads it
// directly.

export interface MainAssetCandidate {
  symbol: string;
  /** The asset's key on its surface (a reserve's address, a market). */
  key: string;
  amount: number;
  decimalsUnread?: boolean;
}

/** `prices` maps a lowercased key to USD per token. Null where no candidate
 *  has a price. */
export function pickMainAsset<T extends MainAssetCandidate>(
  assets: readonly T[],
  prices: Readonly<Record<string, number>> | undefined,
): T | null {
  let best: T | null = null;
  let bestUsd = -1;
  for (const a of assets) {
    if (a.decimalsUnread) continue;
    const p = prices?.[a.key.toLowerCase()] ?? prices?.[a.key];
    if (p == null || !(p > 0)) continue;
    const usd = a.amount * p;
    if (usd > bestUsd) {
      best = a;
      bestUsd = usd;
    }
  }
  return best;
}

/** A closed account's supplied peaks in its dropdown's order: those that
 *  backed borrowing first, then the supplies that backed none (listed under
 *  "Supplied, not collateral"), each group in the side's order. Where the
 *  collateral switches are unread (`isOther` absent), one list as given. */
export function splitSupplied<T>(peaks: readonly T[], isOther?: (p: T) => boolean): { first: T[]; others: T[] } {
  if (!isOther) return { first: [...peaks], others: [] };
  return { first: peaks.filter((p) => !isOther(p)), others: peaks.filter(isOther) };
}
