// Polaris stability-pool deposits and reserve loans — the wire rows of
// rails-server's four routes (api/src/routes/polaris-deposits-loans.ts, migs
// 479 and 480), and the one fetch both halves of a page read them with.
//
// The proxies under app/api/polaris/{stability-pool,reserve-loans} forward
// the path and the allowlisted params unchanged and add `deployment`, so a
// server render reads the box directly through `boxHop()` with the same
// query (lib/shared/listing-ssr.ts) and the client reads the proxy.
//
// Amounts are raw decimal strings in 1e18 units, as the routes serialize them;
// P is 1e36, a debt per share 1e27, and a loan's shares carry up to 18
// decimals. Nothing here scales them: lib/polaris/sp-loan-math.ts and
// lib/polaris/sp-loan-flow-timelines.ts do, from the raw strings.

import { POLARIS_DEPLOYMENT_ID } from "@/lib/polaris/asset-catalog";

/** One deposit: the carry with its newest head row over it. */
export interface PolarisDepositRow {
  deployment_id: string;
  market: "usdp" | "goldp";
  token_id: string;
  holder: string | null;
  status: "open" | "closed";
  vault_held: boolean;
  /** The deposit recorded at the last operation (`DepositUpdated._newDeposit`). */
  deposit_raw: string;
  snapshot_p: string;
  snapshot_s: string;
  snapshot_b: string;
  snapshot_scale: string;
  stashed_bc_raw: string;
  deposited_raw: string;
  withdrawn_raw: string;
  burned_raw: string;
  stable_gain_raw: string;
  stable_claimed_raw: string;
  bc_gain_raw: string;
  bc_claimed_raw: string;
  minted_block: string | null;
  burned_block: string | null;
  first_block: string;
  first_timestamp: string;
  last_block: string;
  last_timestamp: string;
  last_tx_hash: string;
  op_count: number;
  tx_count: number;
}

export interface PolarisSpMarketTotals {
  open: number;
  closed: number;
  last_p: string;
  last_p_block: string | null;
  pool_balance_raw: string | null;
  pool_balance_block: string | null;
}

export interface PolarisDepositListResponse {
  deployment_id: string;
  served_thru_block: string | null;
  rows: PolarisDepositRow[];
  pagination: { total: number; limit: number; offset: number };
  markets: Record<"usdp" | "goldp", PolarisSpMarketTotals>;
}

/** One deposit operation (with the `DepositUpdated` it produced) or one
 *  transfer of the deposit NFT between two holders. */
export interface PolarisDepositEventRow {
  deployment_id: string;
  event_key: string;
  market: "usdp" | "goldp";
  token_id: string;
  event_type: "deposit_operation" | "transfer";
  /** 0 provide · 1 withdraw · 2 claim only. */
  operation: number | null;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  deposit_loss: string | null;
  top_up_or_withdrawal: string | null;
  stable_gain_since: string | null;
  stable_gain_claimed: string | null;
  bc_gain_since: string | null;
  bc_gain_claimed: string | null;
  new_deposit: string | null;
  stashed_bc_tokens: string | null;
  snapshot_p: string | null;
  snapshot_s: string | null;
  snapshot_b: string | null;
  snapshot_scale: string | null;
  updated_log_index: number | null;
  deposit_before: string | null;
  deposited_to_here: string;
  withdrawn_to_here: string;
  burned_to_here: string;
  stable_gain_to_here: string;
  stable_claimed_to_here: string;
  bc_gain_to_here: string;
  bc_claimed_to_here: string;
  from_addr: string | null;
  to_addr: string | null;
}

export interface PolarisDepositTimelineResponse {
  deployment_id: string;
  market: "usdp" | "goldp";
  token_id: string;
  served_thru_block: string | null;
  totalEvents: number;
  pagination: { limit: number; offset: number; order: "asc" | "desc" };
  rows: PolarisDepositEventRow[];
  position: PolarisDepositRow | null;
}

/** The deployment's latest FeesAccrued: the stored debt per share and the
 *  floor it logged. */
export interface PolarisLoanIndex {
  debt_per_share_raw: string;
  floor_price_raw: string;
  block_number: string;
  log_index: number;
  tx_hash: string;
  block_timestamp: string | null;
}

export interface PolarisLoanRow {
  deployment_id: string;
  loan_id: string;
  holder: string | null;
  borrower: string;
  status: "open" | "closed";
  coll_raw: string;
  shares_raw: string;
  /** ceil(shares × debt per share ÷ 1e27) at the response's `index`. */
  debt_at_index_raw: string;
  net_borrowed_raw: string;
  cost_raw: string;
  opened_block: string;
  opened_timestamp: string;
  opened_tx_hash: string;
  closed_block: string | null;
  last_block: string;
  last_timestamp: string;
  last_tx_hash: string;
  adjust_count: number;
  tx_count: number;
}

export interface PolarisLoanListResponse {
  deployment_id: string;
  served_thru_block: string | null;
  index: PolarisLoanIndex | null;
  rows: PolarisLoanRow[];
  pagination: { total: number; limit: number; offset: number };
  totals: { open: number; closed: number; open_coll_raw: string; open_debt_at_index_raw: string };
}

export interface PolarisLoanEventRow {
  deployment_id: string;
  event_key: string;
  loan_id: string;
  event_type: "opened" | "adjusted" | "closed" | "transfer";
  borrower: string | null;
  block_number: string;
  tx_index: number;
  log_index: number;
  tx_hash: string;
  block_timestamp: string;
  tx_from: string | null;
  tx_gas_used: string | null;
  tx_gas_price: string | null;
  /** Signed: + deposited / borrowed, − returned / repaid. */
  coll_change: string | null;
  debt_change: string | null;
  /** The FeesAccrued index in force at the leg, and its log. */
  debt_per_share: string | null;
  debt_per_share_block: string | null;
  debt_per_share_log_index: number | null;
  debt_per_share_tx_hash: string | null;
  floor_price: string | null;
  shares_change: string | null;
  coll_before: string | null;
  coll_after: string | null;
  shares_before: string | null;
  shares_after: string | null;
  net_borrowed_to_here: string | null;
  debt_after: string | null;
  from_addr: string | null;
  to_addr: string | null;
}

export interface PolarisLoanTimelineResponse {
  deployment_id: string;
  loan_id: string;
  served_thru_block: string | null;
  index: PolarisLoanIndex | null;
  totalEvents: number;
  pagination: { limit: number; offset: number; order: "asc" | "desc" };
  rows: PolarisLoanEventRow[];
  position: PolarisLoanRow | null;
}

/** A deposit's day: the running sums after its last operation (each a raw
 *  1e18 integer) and what the day's operations did. */
export interface PolarisDepositDay {
  day: number;
  events: number;
  txs: number;
  did_deposit: boolean;
  did_withdraw: boolean;
  did_burn: boolean;
  did_pay_peth: boolean;
  did_claim: boolean;
  last_block: string;
  last_timestamp: string;
  deposited: string;
  withdrawn: string;
  burned: string;
  yield_in: string;
  yield_claimed: string;
  peth_in: string;
  peth_claimed: string;
  deposit: string;
  stash: string;
}

export interface PolarisDepositDaysResponse {
  deployment_id: string;
  market: "usdp" | "goldp";
  token_id: string;
  served_thru_block: string | null;
  days: PolarisDepositDay[];
}

/** The floor at each day's last FeesAccrued (WETH per fpETH, 1e18). */
export interface PolarisFloorDaysResponse {
  deployment_id: string;
  days: { day: number; floor_price_raw: string; block_number: string }[];
}

/** The routes, each with the params its proxy forwards. */
export const POLARIS_SP_LOAN_ROUTES = {
  "stability-pool": [
    "market",
    "wallet",
    "id",
    "status",
    "vaultHeld",
    "minTx",
    "maxTx",
    "sortBy",
    "sortOrder",
    "limit",
    "offset",
  ],
  "stability-pool/timeline": ["market", "id", "limit", "offset", "order"],
  "stability-pool/flows/daily": ["market", "id"],
  "reserve-loans": ["wallet", "id", "status", "minTx", "maxTx", "sortBy", "sortOrder", "limit", "offset"],
  "reserve-loans/timeline": ["id", "limit", "offset", "order"],
  "reserve-loans/floor/daily": [],
} as const;

export type PolarisSpLoanRoute = keyof typeof POLARIS_SP_LOAN_ROUTES;

/** The query a route is read with: the allowlisted params that are set, and
 *  the catalog's deployment. */
export function polarisSpLoanQuery(
  route: PolarisSpLoanRoute,
  params: URLSearchParams | Record<string, string | undefined>,
): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const qs = new URLSearchParams();
  for (const k of POLARIS_SP_LOAN_ROUTES[route]) {
    const v = get(k);
    if (v != null && v !== "") qs.set(k, v);
  }
  qs.set("deployment", POLARIS_DEPLOYMENT_ID);
  return qs.toString();
}

/** A read that reached the backend and came back not-ok: 404 is "no such
 *  position", anything else a failure. */
export class PolarisSpLoanHttpError extends Error {
  readonly status: number;
  constructor(status: number, statusText: string) {
    super(`Polaris deposits/loans read failed: ${status} ${statusText}`);
    this.name = "PolarisSpLoanHttpError";
    this.status = status;
  }
}

/** One read of a route: through the proxy from the browser (`baseUrl`
 *  absent), or the box from a server render (`boxHop()`'s base and headers). */
export async function readPolarisSpLoans<T>(
  route: PolarisSpLoanRoute,
  params: Record<string, string | undefined>,
  opts: { baseUrl?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<T> {
  const url = `${opts.baseUrl ?? ""}/api/polaris/${route}?${polarisSpLoanQuery(route, params)}`;
  const res = await fetch(url, { cache: "no-store", headers: opts.headers, signal: opts.signal });
  if (!res.ok) throw new PolarisSpLoanHttpError(res.status, res.statusText);
  return (await res.json()) as T;
}
