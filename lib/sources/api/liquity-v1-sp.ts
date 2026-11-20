// Liquity V1 stability-pool deposits — the wire rows of rails-server's three
// routes (api/src/routes/liquityV1StabilityPool.ts, mig 499), and the one
// fetch both halves of a page read them with.
//
// The proxies under app/api/liquity-v1/stability-pool forward the path and
// the allowlisted params unchanged, so a server render reads the box directly
// through `boxHop()` with the same query (lib/shared/listing-ssr.ts) and the
// client reads the proxy.
//
// A deposit is its depositor: one pool, one deposit per address. Amounts are
// raw decimal strings in 1e18 units: LUSD on the deposit side, ETH for eth_*,
// LQTY for lqty_*. The pool pays the ETH and LQTY gains out at every touch,
// so there is no stash. The field meanings are rails-ops
// reference/liquity-v1-stability-pool.md.

/** One deposit: the carry with its newest head row over it. */
export interface LiquityV1DepositRow {
  depositor: string;
  /** open while the recorded deposit is above zero. */
  status: "open" | "closed";
  /** The front end tagged at the opening of the deposit's current life (the
   *  zero address untagged); it takes a share of the deposit's LQTY. */
  front_end: string;
  /** The deposit recorded at the last touch (_newDeposit). */
  deposit_raw: string;
  deposited_raw: string;
  withdrawn_raw: string;
  burned_raw: string;
  /** ETH paid to the depositor at touches. */
  eth_gain_raw: string;
  /** LQTY paid to the depositor at touches (the front end's share not included). */
  lqty_gain_raw: string;
  first_block: string;
  first_timestamp: string;
  last_block: string;
  last_timestamp: string;
  last_tx_hash: string;
  op_count: number;
  tx_count: number;
}

export interface LiquityV1DepositListResponse {
  served_thru_block: string | null;
  rows: LiquityV1DepositRow[];
  pagination: { total: number; limit: number; offset: number };
  counts: { open: number; closed: number };
}

/** The contract call a touch was, read from its logs. */
export type LiquityV1SpOperation = "provideToSP" | "withdrawFromSP" | "withdrawETHGainToTrove";

/** One touch: its three logs paired, with the replay through it. */
export interface LiquityV1DepositEventRow {
  depositor: string;
  event_key: string;
  operation: LiquityV1SpOperation;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  /** The front-end tag in force at the touch. */
  front_end: string;
  /** LUSD burned by liquidations since the last touch (_LUSDLoss). */
  deposit_loss: string;
  /** + top-up, − withdrawal, 0 a claim: deposit_after − (deposit_before − deposit_loss). */
  top_up_or_withdrawal: string;
  /** ETH the touch paid out (_ETH): to the depositor, or to its Trove. */
  eth_gain: string;
  /** LQTY the touch paid the depositor (_LQTY). */
  lqty_gain: string;
  deposit_before: string;
  deposit_after: string;
  deposited_to_here: string;
  withdrawn_to_here: string;
  burned_to_here: string;
  eth_gain_to_here: string;
  lqty_gain_to_here: string;
}

export interface LiquityV1DepositTimelineResponse {
  depositor: string;
  served_thru_block: string | null;
  totalEvents: number;
  pagination: { limit: number; offset: number; order: "asc" | "desc" };
  rows: LiquityV1DepositEventRow[];
  position: LiquityV1DepositRow | null;
}

/** A deposit's day: the running sums after its last touch (each a raw 1e18
 *  integer) and what the day's touches did. */
export interface LiquityV1DepositDay {
  day: number;
  events: number;
  txs: number;
  did_deposit: boolean;
  did_withdraw: boolean;
  did_burn: boolean;
  did_pay_eth: boolean;
  did_pay_lqty: boolean;
  last_block: string;
  last_timestamp: string;
  deposited: string;
  withdrawn: string;
  burned: string;
  eth_in: string;
  lqty_in: string;
  deposit: string;
}

export interface LiquityV1DepositDaysResponse {
  depositor: string;
  served_thru_block: string | null;
  days: LiquityV1DepositDay[];
}

/** The routes, each with the params its proxy forwards. */
export const LIQUITY_V1_SP_ROUTES = {
  "stability-pool": ["wallet", "status", "minTx", "maxTx", "sortBy", "sortOrder", "limit", "offset"],
  "stability-pool/timeline": ["wallet", "limit", "offset", "order"],
  "stability-pool/flows/daily": ["wallet"],
} as const;

export type LiquityV1SpRoute = keyof typeof LIQUITY_V1_SP_ROUTES;

/** The query a route is read with: the allowlisted params that are set. */
export function liquityV1SpQuery(
  route: LiquityV1SpRoute,
  params: URLSearchParams | Record<string, string | undefined>,
): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const qs = new URLSearchParams();
  for (const k of LIQUITY_V1_SP_ROUTES[route]) {
    const v = get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  return qs.toString();
}

/** A read that reached the backend and came back not-ok: 404 is "no such
 *  deposit", anything else a failure. */
export class LiquityV1SpHttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string) {
    super(`Liquity V1 deposit read failed: ${status} ${statusText}`);
    this.name = "LiquityV1SpHttpError";
    this.status = status;
  }
}

/** One read of a route: through the proxy from the browser (`baseUrl`
 *  absent), or the box from a server render (`boxHop()`'s base and headers). */
export async function readLiquityV1Sp<T>(
  route: LiquityV1SpRoute,
  params: Record<string, string | undefined>,
  opts: { baseUrl?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<T> {
  const url = `${opts.baseUrl ?? ""}/api/liquity-v1/${route}?${liquityV1SpQuery(route, params)}`;
  const res = await fetch(url, { cache: "no-store", headers: opts.headers, signal: opts.signal });
  if (!res.ok) throw new LiquityV1SpHttpError(res.status, res.statusText);
  return (await res.json()) as T;
}
