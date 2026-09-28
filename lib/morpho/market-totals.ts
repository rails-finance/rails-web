// A Morpho Blue market's borrow totals, replayed from its logs — and the debt
// a position's shares stand for at them.
// ----------------------------------------------------------------------------
// The same arithmetic server mig 352 runs for Ethereum, in TypeScript for a lane
// that replays in the web (Morpho Base, `replayMorphoRows`). totalBorrowShares
// moves only on Borrow (+shares), Repay (−shares) and Liquidate (−repaid and
// bad-debt shares); totalBorrowAssets on the same three and AccrueInterest
// (+interest). Morpho accrues a market once per block, at its first touch and
// before that touch's own log, so an AccrueInterest sorts before the market's
// other logs of its block. A lane feeds every such log of the market from its
// creation and reads the totals after any one of them.

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

/** One log that moves a market's borrow totals. `assets`/`shares` are signed:
 *  a borrow adds, a repay or liquidation (repaid plus bad debt) subtracts, an
 *  accrual adds its interest and no shares. */
export interface MorphoTotalsLog {
  kind: "borrow" | "repay" | "liquidation" | "accrue";
  blockNumber: number;
  transactionIndex: number;
  logIndex: number;
  assets: bigint;
  shares: bigint;
}

export interface MorphoTotalsAt {
  log: MorphoTotalsLog;
  totalBorrowAssets: bigint;
  totalBorrowShares: bigint;
}

/** The chain's order for a market's totals: block, the accrual first, then
 *  the transaction and the log. */
export function morphoTotalsOrder(a: MorphoTotalsLog, b: MorphoTotalsLog): number {
  return (
    a.blockNumber - b.blockNumber ||
    (a.kind === "accrue" ? 0 : 1) - (b.kind === "accrue" ? 0 : 1) ||
    a.transactionIndex - b.transactionIndex ||
    a.logIndex - b.logIndex
  );
}

/** Replay one market's logs from `seed` (the totals before the first of them,
 *  zero from the market's creation) into the totals after each log. */
export function replayMorphoMarketTotals(
  logs: MorphoTotalsLog[],
  seed: { totalBorrowAssets: bigint; totalBorrowShares: bigint } = {
    totalBorrowAssets: BigInt(0),
    totalBorrowShares: BigInt(0),
  },
): MorphoTotalsAt[] {
  let tba = seed.totalBorrowAssets;
  let tbs = seed.totalBorrowShares;
  return [...logs].sort(morphoTotalsOrder).map((log) => {
    tba += log.assets;
    tbs += log.shares;
    return { log, totalBorrowAssets: tba, totalBorrowShares: tbs };
  });
}
