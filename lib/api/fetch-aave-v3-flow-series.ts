// ============================================================================
// FETCH A LIFETIME FLOWS SERIES
// ============================================================================
//
// The Lifetime flows scrubber's day rows for one position, from rails-server
// GET /api/{aave-v3,spark,aave-v4}/flows/daily through the Next hops
// (app/api/{aave-v3,spark,aave-v4}/flows/route.ts). One shape for every family
// (the server's `FlowSeriesWire`, services/aave-v3-flow-series.ts); rails-ops
// reference/lifetime-flows-scrubber.md states it.

import type { FlowEvent } from "@/lib/shared/flows-timeline";

export interface FlowSeries {
  wallet: string;
  /** The Aave V3 market, "spark", or the Aave V4 spoke key. */
  market: string;
  /** The buckets the position fills, in drawing order; each day's `cum` aligns to it. */
  buckets: string[];
  /** Today's UTC day number. */
  today: number;
  totalEvents: number;
  /** Transactions with an event other than a liquidation: the position card's count. */
  totalTxs?: number;
  /** [UTC day, events through it, tick, cum per bucket, balances stated,
   *  prices carried, transactions through it, the running USD of each
   *  [bucket index, symbol] the day moved] */
  days: [
    number,
    number,
    FlowEvent["tick"],
    number[],
    ["collateral" | "debt", string, number][],
    [string, number, number][],
    number?,
    [number, string, number][]?,
  ][];
  assets: Record<string, { symbol: string; decimals: number }>;
  /** Per held asset: [day, usd] on each day a new price was recorded, and the
   *  longest run of held days that recorded none. */
  prices: Record<string, { obs: [number, number][]; maxGapDays: number }>;
  live: { collateralUsd: number; debtUsd: number };
  unpricedLegs: number;
  /** The Aave V3 Pool family: the whole history per [bucket, asset, token
   *  units, USD at the legs' prices], counted as the bars count it. */
  lifetime?: [string, string, number, number][];
  /** Of the liquidated collateral, what the treasury took: [asset, token units]. */
  treasuryFees?: [string, number][];
}

export type AaveV3FlowSeries = FlowSeries;

/** GET one family's series: `path` is the Next hop ("/api/spark/flows"). */
export async function fetchFlowSeries(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<FlowSeries> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${path}?${qs.toString()}`, { signal });
  if (!res.ok) throw new Error(`fetchFlowSeries ${path} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as FlowSeries;
}

export function fetchAaveV3FlowSeries(p: {
  wallet: string;
  market: string;
  signal?: AbortSignal;
}): Promise<FlowSeries> {
  return fetchFlowSeries("/api/aave-v3/flows", { wallet: p.wallet, market: p.market }, p.signal);
}
