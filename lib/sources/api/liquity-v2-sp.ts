// Liquity V2 stability-pool deposits — the wire rows of rails-server's four
// routes (api/src/routes/liquityV2StabilityPool.ts, migs 490 and 491), and the
// one fetch both halves of a page read them with.
//
// The proxies under app/api/liquity-v2/stability-pool forward the path and
// the allowlisted params unchanged, so a server render reads the box directly
// through `boxHop()` with the same query (lib/shared/listing-ssr.ts) and the
// client reads the proxy.
//
// A deposit is (collateralType, depositor): one per branch pool and address.
// Amounts are raw decimal strings in 1e18 units: BOLD on the deposit side, the
// branch collateral for coll_*. The field meanings are rails-ops
// reference/liquity-v2-stability-pool-deposits.md: yield_gain_claimed is BOLD,
// and coll_gain_claimed includes the stash from earlier touches.

/** The branch collateral as the routes key it. */
export type LiquityV2SpBranch = "WETH" | "wstETH" | "rETH";

/** One deposit: the carry with its newest head row over it. */
export interface LiquityV2DepositRow {
  collateral_type: LiquityV2SpBranch;
  depositor: string;
  /** open while the recorded deposit is above zero. */
  status: "open" | "closed";
  /** The deposit recorded at the last touch (`deposits(depositor)`). */
  deposit_raw: string;
  /** Collateral earned at touches and not yet sent (`stashedColl(depositor)`). */
  stash_raw: string;
  deposited_raw: string;
  withdrawn_raw: string;
  burned_raw: string;
  yield_gain_raw: string;
  yield_claimed_raw: string;
  coll_gain_raw: string;
  coll_claimed_raw: string;
  first_block: string;
  first_timestamp: string;
  last_block: string;
  last_timestamp: string;
  last_tx_hash: string;
  op_count: number;
  tx_count: number;
}

export interface LiquityV2DepositListResponse {
  served_thru_block: string | null;
  rows: LiquityV2DepositRow[];
  pagination: { total: number; limit: number; offset: number };
  branches: Record<LiquityV2SpBranch, { open: number; closed: number }>;
}

/** One DepositOperation, with the replay through it. */
export interface LiquityV2DepositEventRow {
  collateral_type: LiquityV2SpBranch;
  depositor: string;
  event_key: string;
  /** 0 provideToSP · 1 withdrawFromSP · 2 claimAllCollGains. */
  operation: number;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string | null;
  gas_used: string | null;
  effective_gas_price: string | null;
  /** BOLD burned by liquidations since the last touch. */
  deposit_loss: string;
  /** + top-up, − withdrawal. */
  top_up_or_withdrawal: string;
  /** BOLD yield earned since the last touch. */
  yield_gain_since: string;
  /** The part of it sent out, in BOLD; the rest joins the deposit. */
  yield_gain_claimed: string;
  /** Branch collateral earned since the last touch. */
  coll_gain_since: string;
  /** Collateral sent out, the stash from earlier touches included. */
  coll_gain_claimed: string;
  deposit_before: string;
  deposit_after: string;
  stash_before: string;
  stash_after: string;
  deposited_to_here: string;
  withdrawn_to_here: string;
  burned_to_here: string;
  yield_gain_to_here: string;
  yield_claimed_to_here: string;
  coll_gain_to_here: string;
  coll_claimed_to_here: string;
}

export interface LiquityV2DepositTimelineResponse {
  collateral_type: LiquityV2SpBranch;
  depositor: string;
  served_thru_block: string | null;
  totalEvents: number;
  pagination: { limit: number; offset: number; order: "asc" | "desc" };
  rows: LiquityV2DepositEventRow[];
  position: LiquityV2DepositRow | null;
}

/** A deposit's day: the running sums after its last operation (each a raw
 *  1e18 integer) and what the day's operations did. */
export interface LiquityV2DepositDay {
  day: number;
  events: number;
  txs: number;
  did_deposit: boolean;
  did_withdraw: boolean;
  did_burn: boolean;
  did_pay_coll: boolean;
  did_claim: boolean;
  last_block: string;
  last_timestamp: string;
  deposited: string;
  withdrawn: string;
  burned: string;
  yield_in: string;
  yield_claimed: string;
  coll_in: string;
  coll_claimed: string;
  deposit: string;
  stash: string;
}

export interface LiquityV2DepositDaysResponse {
  collateral_type: LiquityV2SpBranch;
  depositor: string;
  served_thru_block: string | null;
  days: LiquityV2DepositDay[];
}

/** What one liquidation did to the deposit, from the pool's P/S replay
 *  (rails-server services/liquity-v2-sp-liquidations.ts). `price` is the
 *  Liquidation log's _price, BOLD per unit of the branch collateral; the
 *  value and the net are BOLD. `net` can be negative. */
export interface LiquityV2DepositLiquidation {
  block_number: string;
  block_timestamp: string;
  tx_hash: string;
  tx_index: number;
  log_index: number;
  price: string;
  pool_bold_before: string;
  pool_debt_offset: string;
  pool_coll_sent: string;
  deposit_before: string;
  bold_lost: string;
  coll_gained: string;
  coll_gained_value: string;
  net: string;
}

export interface LiquityV2DepositLiquidationTotals {
  bold_lost: string;
  coll_gained: string;
  coll_gained_value: string;
  net: string;
}

/** The deposit between two of its touches; `to` null on the open stretch,
 *  which runs to served_thru_block. `event_key` matches the timeline rows. */
export interface LiquityV2DepositStretch {
  from: { event_key: string; block_number: string; block_timestamp: string; tx_hash: string; deposit: string };
  to: {
    event_key: string;
    block_number: string;
    block_timestamp: string;
    tx_hash: string;
    deposit_loss: string;
    coll_gain_since: string;
  } | null;
  liquidations: LiquityV2DepositLiquidation[];
  totals: LiquityV2DepositLiquidationTotals;
  /** Closed stretches: the closing touch's figure less the liquidations' sum. */
  residual: { bold_lost: string; coll_gained: string } | null;
  reconciles: boolean | null;
}

export interface LiquityV2DepositLiquidationsResponse {
  collateral_type: LiquityV2SpBranch;
  depositor: string;
  served_thru_block: string;
  units: { bold: string; coll: string; price: string };
  totals: LiquityV2DepositLiquidationTotals & { liquidations: number };
  /** Null when the deposit is closed. */
  since_last_touch: LiquityV2DepositStretch | null;
  /** Closed stretches holding a liquidation or a reported loss, oldest first. */
  stretches: LiquityV2DepositStretch[];
  /** The replay against every closed stretch on the branch, decimal counts:
   *  `unreconciled` stretches whose liquidations do not sum to their touch. */
  branch_check?: { deposits: string; closed_stretches: string; unreconciled: string };
}

/** The routes, each with the params its proxy forwards. */
export const LIQUITY_V2_SP_ROUTES = {
  "stability-pool": ["collateralType", "wallet", "status", "minTx", "maxTx", "sortBy", "sortOrder", "limit", "offset"],
  "stability-pool/timeline": ["collateralType", "wallet", "limit", "offset", "order"],
  "stability-pool/flows/daily": ["collateralType", "wallet"],
  "stability-pool/liquidations": ["collateralType", "wallet"],
} as const;

export type LiquityV2SpRoute = keyof typeof LIQUITY_V2_SP_ROUTES;

/** The query a route is read with: the allowlisted params that are set. */
export function liquityV2SpQuery(
  route: LiquityV2SpRoute,
  params: URLSearchParams | Record<string, string | undefined>,
): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const qs = new URLSearchParams();
  for (const k of LIQUITY_V2_SP_ROUTES[route]) {
    const v = get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  return qs.toString();
}

/** A read that reached the backend and came back not-ok: 404 is "no such
 *  deposit", anything else a failure. */
export class LiquityV2SpHttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string) {
    super(`Liquity V2 deposit read failed: ${status} ${statusText}`);
    this.name = "LiquityV2SpHttpError";
    this.status = status;
  }
}

/** One read of a route: through the proxy from the browser (`baseUrl`
 *  absent), or the box from a server render (`boxHop()`'s base and headers). */
export async function readLiquityV2Sp<T>(
  route: LiquityV2SpRoute,
  params: Record<string, string | undefined>,
  opts: { baseUrl?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<T> {
  const url = `${opts.baseUrl ?? ""}/api/liquity-v2/${route}?${liquityV2SpQuery(route, params)}`;
  const res = await fetch(url, { cache: "no-store", headers: opts.headers, signal: opts.signal });
  if (!res.ok) throw new LiquityV2SpHttpError(res.status, res.statusText);
  return (await res.json()) as T;
}
