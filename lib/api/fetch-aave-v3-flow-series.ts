// ============================================================================
// FETCH AAVE V3 FLOW SERIES
// ============================================================================
//
// The Lifetime flows scrubber's day rows for one Aave V3 position, from
// rails-server GET /api/aave-v3/flows/daily through the Next hop
// (app/api/aave-v3/flows/route.ts). The shape is the server's
// (services/aave-v3-flow-series.ts `FlowSeriesWire`); rails-ops
// reference/lifetime-flows-scrubber.md states it.

import type { FlowEvent } from "@/lib/shared/flows-timeline";

export interface AaveV3FlowSeries {
  wallet: string;
  market: string;
  /** The buckets the position fills, in drawing order; each day's `cum` aligns to it. */
  buckets: string[];
  /** Today's UTC day number. */
  today: number;
  totalEvents: number;
  /** [UTC day, events through it, tick, cum per bucket, balances stated, prices carried] */
  days: [
    number,
    number,
    FlowEvent["tick"],
    number[],
    ["collateral" | "debt", string, number][],
    [string, number, number][],
  ][];
  assets: Record<string, { symbol: string; decimals: number }>;
  /** Per held asset: [day, usd] on each day a new price was recorded, and the
   *  longest run of held days that recorded none. */
  prices: Record<string, { obs: [number, number][]; maxGapDays: number }>;
  live: { collateralUsd: number; debtUsd: number };
  unpricedLegs: number;
}

export async function fetchAaveV3FlowSeries(p: {
  wallet: string;
  market: string;
  signal?: AbortSignal;
}): Promise<AaveV3FlowSeries> {
  const qs = new URLSearchParams({ wallet: p.wallet, market: p.market });
  const res = await fetch(`/api/aave-v3/flows?${qs.toString()}`, { signal: p.signal });
  if (!res.ok) throw new Error(`fetchAaveV3FlowSeries failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as AaveV3FlowSeries;
}
