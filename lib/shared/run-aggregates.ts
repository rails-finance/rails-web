// Aggregation helpers for collapsed timeline runs (see
// `components/shared/timeline-run-card.tsx`).
//
// A run's header pairs are Σ over the member events' OWN chain deltas, so the
// sum has to respect what those deltas are denominated in: a keeper's
// liquidation burst can repay USDC on one row and USDT on the next, and seize
// WETH on one and wstETH on the next. Summing across symbols would invent a
// figure no chain read supports, so runs sum PER SYMBOL and render one header
// pair per symbol that actually moved.

/** One member's contribution to a leg: what moved, and in which asset. */
export interface RunAggregateEntry {
  symbol?: string | null;
  /** The member's own delta. Signed or unsigned — the magnitude is summed. */
  amount?: string | number | null;
}

/**
 * Sum the magnitudes of `entries` per symbol, in first-seen symbol order.
 *
 * Entries without a symbol, or whose amount is missing or unparseable, are
 * skipped — an unknown denomination cannot join a sum (a symbol-less leg is an
 * omission, not a zero). A symbol whose members all moved 0 still gets a key
 * with value 0; the run card hides a pair whose sum is 0.
 */
export function sumBySymbol(entries: RunAggregateEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of entries) {
    const symbol = entry.symbol;
    if (!symbol) continue;
    const amount = typeof entry.amount === "string" ? Number(entry.amount) : entry.amount;
    if (amount == null || !Number.isFinite(amount)) continue;
    out.set(symbol, (out.get(symbol) ?? 0) + Math.abs(amount));
  }
  return out;
}
