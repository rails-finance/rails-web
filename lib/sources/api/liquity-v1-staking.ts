// Liquity V1 LQTY stakes — the wire rows of rails-server's three routes
// (api/src/routes/liquityV1Staking.ts, migs 501, 502), and the one fetch both
// halves of a page read them with.
//
// The proxies under app/api/liquity-v1/staking forward the path and the
// allowlisted params unchanged, so a server render reads the box directly
// through `boxHop()` with the same query (lib/shared/listing-ssr.ts) and the
// client reads the proxy.
//
// A stake is its staker: one per address in LQTYStaking. Amounts are raw
// decimal strings in 1e18 units: LQTY on the stake side, LUSD for lusd_*, ETH
// for eth_*. LQTYStaking pays both fees out at every touch, so nothing is
// stashed. A touch is a stake, an unstake or a claim (unstake(0): the fees
// paid, the stake unchanged).

/** One stake: the carry with its newest head row over it. */
export interface LiquityV1StakeRow {
  staker: string;
  /** open while the stake is above zero. */
  status: "open" | "closed";
  /** The stake after the last touch (_newStake). */
  stake_raw: string;
  staked_raw: string;
  unstaked_raw: string;
  /** LUSD fees paid to the staker at touches. */
  lusd_gain_raw: string;
  /** ETH fees paid to the staker at touches. */
  eth_gain_raw: string;
  first_block: string;
  first_timestamp: string;
  last_block: string;
  last_timestamp: string;
  last_tx_hash: string;
  op_count: number;
  tx_count: number;
}

export interface LiquityV1StakeListResponse {
  served_thru_block: string | null;
  rows: LiquityV1StakeRow[];
  pagination: { total: number; limit: number; offset: number };
  counts: { open: number; closed: number };
}

export type LiquityV1StakeOperation = "stake" | "unstake" | "claim";

/** One touch: its StakingGainsWithdrawn, with the StakeChanged before it. */
export interface LiquityV1StakeEventRow {
  staker: string;
  event_key: string;
  operation: LiquityV1StakeOperation;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  /** + staked, − unstaked, 0 a claim: stake_after − stake_before. */
  stake_change: string;
  /** LUSD fees the touch paid (LUSDGain). */
  lusd_gain: string;
  /** ETH fees the touch paid (ETHGain). */
  eth_gain: string;
  stake_before: string;
  stake_after: string;
  staked_to_here: string;
  unstaked_to_here: string;
  lusd_gain_to_here: string;
  eth_gain_to_here: string;
}

export interface LiquityV1StakeTimelineResponse {
  staker: string;
  served_thru_block: string | null;
  totalEvents: number;
  pagination: { limit: number; offset: number; order: "asc" | "desc" };
  rows: LiquityV1StakeEventRow[];
  position: LiquityV1StakeRow | null;
}

/** A stake's day: the running sums after its last touch (each a raw 1e18
 *  integer) and what the day's touches did. */
export interface LiquityV1StakeDay {
  day: number;
  events: number;
  txs: number;
  did_stake: boolean;
  did_unstake: boolean;
  did_claim: boolean;
  did_pay_lusd: boolean;
  did_pay_eth: boolean;
  last_block: string;
  last_timestamp: string;
  staked: string;
  unstaked: string;
  lusd_in: string;
  eth_in: string;
  stake: string;
}

export interface LiquityV1StakeDaysResponse {
  staker: string;
  served_thru_block: string | null;
  days: LiquityV1StakeDay[];
}

/** The routes, each with the params its proxy forwards. */
export const LIQUITY_V1_STAKING_ROUTES = {
  staking: ["wallet", "status", "minTx", "maxTx", "sortBy", "sortOrder", "limit", "offset"],
  "staking/timeline": ["wallet", "limit", "offset", "order"],
  "staking/flows/daily": ["wallet"],
} as const;

export type LiquityV1StakingRoute = keyof typeof LIQUITY_V1_STAKING_ROUTES;

/** The query a route is read with: the allowlisted params that are set. */
export function liquityV1StakingQuery(
  route: LiquityV1StakingRoute,
  params: URLSearchParams | Record<string, string | undefined>,
): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const qs = new URLSearchParams();
  for (const k of LIQUITY_V1_STAKING_ROUTES[route]) {
    const v = get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  return qs.toString();
}

/** A read that reached the backend and came back not-ok: 404 is "no such
 *  stake", anything else a failure. */
export class LiquityV1StakingHttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string) {
    super(`Liquity V1 stake read failed: ${status} ${statusText}`);
    this.name = "LiquityV1StakingHttpError";
    this.status = status;
  }
}

/** One read of a route: through the proxy from the browser (`baseUrl`
 *  absent), or the box from a server render (`boxHop()`'s base and headers). */
export async function readLiquityV1Staking<T>(
  route: LiquityV1StakingRoute,
  params: Record<string, string | undefined>,
  opts: { baseUrl?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<T> {
  const url = `${opts.baseUrl ?? ""}/api/liquity-v1/${route}?${liquityV1StakingQuery(route, params)}`;
  const res = await fetch(url, { cache: "no-store", headers: opts.headers, signal: opts.signal });
  if (!res.ok) throw new LiquityV1StakingHttpError(res.status, res.statusText);
  return (await res.json()) as T;
}
