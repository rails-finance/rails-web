// A closed Dolomite account's record, read from the rows the page holds:
// each market's highest token balance (before or after any row, interest
// included, as every explorer counts peaks), and what each liquidation did.
// Only for a page holding the whole history. A market with a row that lacks
// its token balances keeps the listing's par figure.

import { parseUnits } from "viem";
import type { DolomiteEvent } from "@/lib/dolomite/explainer-clauses";
import type { DolomitePeakAmount } from "@/lib/sources/api/dolomite-positions";
import { liquidationStories, type LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";
import { externalActor } from "@/lib/shared/external-actor";

const ZERO = BigInt(0);

const rawOf = (s: string | undefined, decimals: number): bigint | null => {
  if (s == null) return null;
  try {
    return parseUnits(s, decimals);
  } catch {
    return null;
  }
};

interface MarketPeak {
  supply: bigint | null;
  debt: bigint | null;
}

function tokenPeaks(events: readonly DolomiteEvent[]): Map<number, MarketPeak> {
  const out = new Map<number, MarketPeak>();
  for (const e of events) {
    const d = e.context.data;
    if (d.marketId < 0) continue;
    const cur = out.get(d.marketId) ?? { supply: ZERO, debt: ZERO };
    const before = rawOf(d.balanceBefore, d.decimals);
    const after = rawOf(d.balanceAfter, d.decimals);
    if (before == null || after == null) {
      cur.supply = null;
      cur.debt = null;
    } else {
      for (const v of [before, after]) {
        if (cur.supply != null && v > cur.supply) cur.supply = v;
        if (cur.debt != null && -v > cur.debt) cur.debt = -v;
      }
    }
    out.set(d.marketId, cur);
  }
  return out;
}

/** The peak lines with each market's par replaced by its token peak where the
 *  rows state one. */
export function withTokenPeaks(
  lines: readonly DolomitePeakAmount[],
  events: readonly DolomiteEvent[],
  side: "supply" | "debt",
): DolomitePeakAmount[] {
  const peaks = tokenPeaks(events);
  return lines.map((l) => {
    const p = peaks.get(l.marketId);
    const v = p ? (side === "supply" ? p.supply : p.debt) : null;
    if (v == null || v <= ZERO || l.decimalsUnread) return l;
    const div = BigInt(10) ** BigInt(l.decimals);
    const amount = Number(v / div) + Number(v % div) / Number(div);
    return { ...l, amount, amountRaw: v.toString(), tokens: true };
  });
}

/** What each liquidation of the account did (the debt leg's repaid amount
 *  against the debt just before it), and whether the owner repaid the rest. */
export function dolomiteLiquidationStories(events: readonly DolomiteEvent[]): LiquidationStory[] {
  return liquidationStories(
    events.map((e) => {
      const d = e.context.data;
      const kind =
        d.eventType === "liquidation"
          ? ("liquidation" as const)
          : (d.eventType === "deposit" || d.eventType === "transfer_in") && d.parBefore?.startsWith("-")
            ? ("repay" as const)
            : ("other" as const);
      const debtOf = (s: string | undefined) => (s != null && s.startsWith("-") ? Math.abs(Number(s)) : 0);
      return {
        timestamp: e.timestamp,
        txHash: e.txHash,
        kind,
        market: String(d.marketId),
        symbol: d.marketSymbol,
        amount: d.weiDelta != null ? Math.abs(Number(d.weiDelta)) : undefined,
        debtBefore: d.balanceBefore != null ? debtOf(d.balanceBefore) : undefined,
        debtAfter: d.balanceAfter != null ? debtOf(d.balanceAfter) : undefined,
        byOwner: externalActor({ txFrom: d.txFrom, poolCaller: d.caller }, e.wallet) == null,
      };
    }),
  );
}
