// The day states the shared flow-legs fixtures hold (rails-ops
// reference/lifetime-flows-scrubber.md, "One classifier, two repos"): after
// each active day, every balance, price and per-asset total so far, and the
// transactions so far. rails-server's tests build the same from their rows.
import type { FlowDayRow } from "@/lib/shared/flows-timeline";

export interface DayState {
  day: number;
  events: number;
  tick: string;
  cum: Record<string, number>;
  /** Every balance stated so far, `${side}:${asset}` → amount. */
  held: Record<string, number>;
  /** Each asset's last at-block price so far: [usd, unix seconds]. */
  prices: Record<string, [number, number]>;
  /** Transactions so far (the card's count). */
  txs: number;
  /** Running USD per `${bucket}|${symbol}` so far. */
  cells: Record<string, number>;
}

/** The fixture's day states from day rows: every balance, price and asset
 *  total so far. rails-server's test builds the same from its own rows. */
export function dayStates(rows: FlowDayRow[]): DayState[] {
  const held: Record<string, number> = {};
  const prices: Record<string, [number, number]> = {};
  const cells: Record<string, number> = {};
  return rows.map((d) => {
    for (const b of d.balances) held[`${b.side}:${b.asset}`] = b.amount;
    for (const p of d.prices) prices[p.asset] = [p.usd, p.ts];
    for (const c of d.cumAsset ?? []) cells[`${c.bucket}|${c.symbol}`] = c.usd;
    const cum = Object.fromEntries(Object.entries(d.cum).filter(([, v]) => v !== 0));
    return {
      day: d.day,
      events: d.events,
      tick: d.tick,
      cum,
      held: { ...held },
      prices: { ...prices },
      txs: d.txs ?? 0,
      cells: { ...cells },
    };
  });
}
