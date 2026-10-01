// Dolomite position-card captions: the borrow rate under the debt figure.
// The account's lifetime flows are the Lifetime flows panel's
// (lib/dolomite/flows.ts).

import type { DolomitePositionView } from "@/components/protocol/dolomite/dolomite-position-card";

/** Position-card stat captions. null = the caption simply doesn't render. */
export interface DolomiteCardCaptions {
  /** Current borrow APR (%). `avg` when debt-USD-weighted across several
   *  borrowed markets; `symbol` names the market when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
}

export function computeDolomiteCardCaptions(view: DolomitePositionView): DolomiteCardCaptions {
  const usdOf = (marketId: number, amount: number): number | null => {
    const p = view.priceByMarket?.[String(marketId)];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const rateOf = (marketId: number): number | null => view.ratesByMarket?.[String(marketId)]?.borrowAprPct ?? null;

  let borrowRate: DolomiteCardCaptions["borrowRate"] = null;
  const borrowed = view.borrows.filter((r) => (r.current ?? r.par) > 0);
  if (borrowed.length === 1) {
    const r = rateOf(borrowed[0].marketId);
    if (r != null) borrowRate = { pct: r, avg: false, symbol: borrowed[0].symbol };
  } else if (borrowed.length > 1 && borrowed.every((b) => rateOf(b.marketId) != null)) {
    let wSum = 0;
    let rSum = 0;
    for (const b of borrowed) {
      const w = usdOf(b.marketId, b.current ?? b.par);
      if (w == null || w <= 0) {
        wSum = 0;
        break;
      }
      wSum += w;
      rSum += (rateOf(b.marketId) as number) * w;
    }
    if (wSum > 0) borrowRate = { pct: rSum / wSum, avg: true };
  }

  return { borrowRate };
}
