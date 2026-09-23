// f(x) V2 per-interval socialized drift — the api arm's shape + fetch.
// ----------------------------------------------------------------------------
// Between a position's own touches, funding (the collateral index), tick/pool
// rebalances and socialized bad debt move its real collateral and debt with NO
// per-position event. rails-server's /drift route reads the pool's own
// getPosition at each pair of boundary blocks (archive eth_calls, cached
// forever once a block has passed — server mig 191) and ends the last interval
// at the settled sweep row, the SAME read the position card shows. So the
// intervals here sum to the card's own reconciliation by construction, and a
// second request costs nothing but a database read.
//
// Reads are budgeted server-side, newest interval first: `unread` says how
// many older intervals are still to come, and re-fetching reads the next batch.

import type { FxPoolKey } from "@/lib/fx/asset-catalog";

export interface FxDriftInterval {
  /** Post-event state at the interval's opening event block. */
  fromBlock: number;
  /** Pre-event state at (next event block − 1); the last interval ends at the
   *  settled sweep's block instead and is flagged `toHead`. */
  toBlock: number;
  toHead: boolean;
  /** NORMALIZED 1e18 units / fxUSD 1e18, human-readable numbers. */
  collsStart: number;
  collsEnd: number;
  debtsStart: number;
  debtsEnd: number;
  /** end − start: negative = the socialized lane took from the position. */
  collsDrift: number;
  debtsDrift: number;
}

export interface FxDriftResult {
  /** Ascending; always the NEWEST suffix of the position's intervals. */
  intervals: FxDriftInterval[];
  /** Older intervals not read yet — another fetch reads the next batch. */
  unread: number;
  /** The settled sweep's block (the head interval's end), or null pre-sweep. */
  headBlock: number | null;
  /** The sweep row predates the position's last event, so the head interval
   *  is withheld until the next sweep rather than stated backwards. */
  headPending: boolean;
  reads: { cached: number; chain: number };
  /** The server's chain reads stopped early (the archive RPC refused or timed
   *  out, or the request's time ran out): the intervals already bounded are
   *  here, the rest count in `unread`, and this names why. Null when every
   *  boundary the request set out to read was read. */
  stalled: string | null;
}

/** A rebalance card's own-position slice: the interval holding the rebalance
 *  and how many rebalances share it (one = the debt leg is this position's
 *  exact slice of the tick's clear). */
export interface FxDriftSlice {
  interval: FxDriftInterval;
  rebalances: number;
}

/** A failure the route could name (never the provider URL). */
export class FxDriftError extends Error {
  constructor(
    message: string,
    public readonly reason: string | null,
  ) {
    super(message);
  }
}

export async function fetchFxDrift(pool: FxPoolKey, positionId: string, signal?: AbortSignal): Promise<FxDriftResult> {
  const res = await fetch(`/api/fx/position/${pool}/${encodeURIComponent(positionId)}/drift`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { reason?: unknown } | null;
    throw new FxDriftError(`fetchFxDrift failed: ${res.status}`, typeof body?.reason === "string" ? body.reason : null);
  }
  return (await res.json()) as FxDriftResult;
}

/** The lifetime figure the card states from the intervals: the socialized
 *  lane's collateral movement summed over the intervals in hand. `complete`
 *  is true only when every interval of the position's life is in the sum —
 *  the whole history read and the head interval present. */
export function summariseFxDrift(drift: FxDriftResult): {
  collsDrift: number;
  debtsDrift: number;
  intervals: number;
  complete: boolean;
} {
  let collsDrift = 0;
  let debtsDrift = 0;
  for (const iv of drift.intervals) {
    collsDrift += iv.collsDrift;
    debtsDrift += iv.debtsDrift;
  }
  return {
    collsDrift,
    debtsDrift,
    intervals: drift.intervals.length,
    complete: drift.unread === 0 && !drift.headPending && drift.headBlock != null,
  };
}

/** This position's OWN drift over the stretch holding a tick rebalance at
 *  `blockNumber` — the interval whose block range contains it, or undefined
 *  while that interval is unread. */
export function driftIntervalAt(drift: FxDriftResult | null, blockNumber: number): FxDriftInterval | undefined {
  if (!drift) return undefined;
  return drift.intervals.find((iv) => iv.fromBlock <= blockNumber && blockNumber <= iv.toBlock);
}
