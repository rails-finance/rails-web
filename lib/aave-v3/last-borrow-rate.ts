// The variable borrow rate the Pool logged at an account's newest borrow of
// one reserve (the Borrow log's `borrowRate`, ray). The card's explanation
// sets it beside the rate read now, so a reader who sees 1.77% on the row and
// 0.08% on the card is told the rate moved and what moves it.
//
// Client-safe.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";

export interface AaveV3LastBorrowRate {
  /** Underlying token, lowercase. */
  address: string;
  symbol: string;
  /** Percent a year. */
  pct: number;
  /** Unix seconds of the borrow. */
  at: number;
}

export function aaveV3LastBorrowRate(events: BaseActivityEvent[], address: string): AaveV3LastBorrowRate | null {
  const a = address.toLowerCase();
  let best: AaveV3LastBorrowRate | null = null;
  for (const e of events) {
    if (!isAaveV3Event(e)) continue;
    const d = e.context.data;
    if (d.eventType !== "borrow" || !d.borrowRate) continue;
    if (e.flows?.[0]?.token?.toLowerCase() !== a) continue;
    if (best && e.timestamp <= best.at) continue;
    let pct: number;
    try {
      pct = (Number(BigInt(d.borrowRate) / BigInt(10) ** BigInt(21)) / 1e6) * 100;
    } catch {
      continue;
    }
    best = { address: a, symbol: d.reserveSymbol ?? e.flows?.[0]?.tokenSymbol ?? "", pct, at: e.timestamp };
  }
  return best;
}
