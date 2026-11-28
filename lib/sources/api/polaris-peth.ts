// One address's pETH account on Polaris — the wire shape of rails-server's
// GET /api/polaris/peth/:address (api/src/routes/polaris-peth.ts, mig 537;
// ui-jobs 865), and the one fetch both halves of the page read it with.
//
// The proxy at app/api/polaris/peth/[address] forwards `limit` and `offset`
// (lib/api/polaris-peth-proxy.ts); a server render reads the box directly
// through `boxHop()` with the same query. Amounts are raw 1e18 decimal
// strings, blocks decimal strings. Nothing here scales them:
// lib/polaris/peth-ledger.ts does.
//
// The ledger lane may still be reading the history (`ledger.complete`
// false): the ledger's figures and rows are then null and the head reads
// still answer. With no chain read (`head` null, `head_unread_reason` set)
// the head figures are null and the stored ledger still answers.

/** A figure the ledger sums, with where it came from. */
export interface PethLedgerFigure {
  raw: string | null;
  source: string;
  block: string | null;
}

export interface PethHeadStamp {
  block: string | null;
  source: string | null;
}

export interface PethCdpPlace {
  market: "usdp" | "goldp";
  cdp_id: string;
  coll_raw: string;
  as_of_block: string;
  as_of_tx: string;
}

export interface PethSpPlace {
  market: "usdp" | "goldp";
  token_id: string;
  /** stashedBcTokens at the deposit's last operation. */
  peth_raw: string;
  deposit_raw: string;
  as_of_block: string;
  as_of_tx: string;
}

export interface PethLoanPlace {
  loan_id: string;
  fpeth_raw: string;
  opened_block: string;
}

export interface PethLpPlace extends PethHeadStamp {
  venue: "venue_curve_tripool" | "venue_univ2_polar_peth" | "venue_univ2_peth_weth";
  address: string;
  lp_balance_raw: string | null;
  lp_supply_raw: string | null;
  pool_peth_raw: string | null;
  peth_share_raw: string | null;
}

export interface PethRollup {
  wallet_peth: PethHeadStamp & { raw: string | null; at_spot_raw: string | null; at_floor_raw: string | null };
  cdp_collateral: { raw: string | null; source: string; items: PethCdpPlace[] | null };
  sp_peth: { raw: string | null; source: string; items: PethSpPlace[] | null };
  loans_fpeth: { raw: string | null; source: string; items: PethLoanPlace[] | null };
  wallet_fpeth: PethHeadStamp & { raw: string | null; at_floor_raw: string | null };
  lp: PethLpPlace[];
  wallet_vpeth: PethHeadStamp & { raw: string | null; valued: false };
  /** svpETH shares and the vpETH they convert to; absent on a server before
   *  47579eb0, null with the head unread. */
  wallet_svpeth?: (PethHeadStamp & { raw: string | null; vpeth_raw: string | null; valued: false }) | null;
}

/** `not_decoded`: a move Rails does not read yet (vpETH with Morpho Blue),
 *  which no figure counts. */
export type PethEffect = "acquisition" | "sale" | "fee" | "change_of_place" | "income" | "exit" | "not_decoded";

export interface PethLedgerLine {
  rule: string;
  effect: PethEffect;
  /** "peth" | "fpeth" | "vpeth" | an LP token key | a token address. */
  token: string;
  direction: "in" | "out";
  amount_raw: string;
  counterparty: string;
  counterparty_role: string | null;
  counterparty_code_size: number | null;
  log_index: number | null;
}

export interface PethValuation {
  kind: "polar_conversion" | "psm_mint" | "peth_arrival";
  peth_raw: string;
  basis: string;
  market?: string;
  stables_raw?: string;
  block: string;
  source: string;
  /** False until the price filler reaches the block. */
  price_at_block_filled: boolean;
  eth_raw: string | null;
  eth_at_spot_raw: string | null;
  eth_at_floor_raw: string | null;
}

// MIRROR of ui-jobs 872's place type (rails-web c99587e56, field for field),
// so the map (ui-jobs 873) builds before 872 lands; 872's merge replaces it.

/** A row's place (api services/polaris-peth-ledger.ts, placesOf): a CDP, a
 *  reserve loan or a Stability Pool deposit by its id (and market), or a
 *  contract of the deployment by its address (a venue with its deployment
 *  column in `market`). */
export interface PethPlace {
  kind: "cdp" | "loan" | "sp_deposit" | "venue" | "svpeth" | "splitter" | "curve" | "morpho" | "zap";
  id?: string;
  market?: string;
  address?: string;
}

export interface PethLedgerRow {
  /** Where the row's tokens went or came from: its primary line's place, or
   *  null; absent on a server before ui-jobs 872. (872 mirror.) */
  place?: PethPlace | null;
  /** Every place the row's lines touch, in line order, once each. (872 mirror.) */
  places?: PethPlace[];
  tx_hash: string;
  block_number: string;
  block_timestamp: string | null;
  tx_index?: number | null;
  first_log_index?: number | null;
  kind: string;
  effect: PethEffect;
  lines: PethLedgerLine[];
  peth_delta_raw: string;
  fpeth_delta_raw: string;
  vpeth_delta_raw: string;
  eth_in_raw: string;
  eth_out_raw: string;
  curve_fee_raw: string;
  /** ETH per pETH, 1e18, from the row's event (trade rows only). */
  event_price_raw: string | null;
  event_price_source: string | null;
  valuation: PethValuation | null;
  zap: { token_in: string; token_out: string; amount_in: string; amount_out: string } | null;
  /** The address's balance of each token just before and just after this
   *  transaction, from its stored transfers; null unless status is "ok".
   *  A token's entry may be null, which draws no side for it. */
  balances?: {
    peth: { before_raw: string; after_raw: string } | null;
    fpeth: { before_raw: string; after_raw: string } | null;
    vpeth?: { before_raw: string; after_raw: string } | null;
  } | null;
  /** ETH in, ETH out and curve fees through this transaction; null unless
   *  status is "ok". */
  to_date?: { eth_in_raw: string; eth_out_raw: string; curve_fees_raw: string } | null;
}

/** How far the ledger lane has read (the server's fix round, 27 Nov 2026). */
export interface PethLedgerState {
  /** True or false where the head was read; null where it was not, and the
   *  stored ledger is served unchecked for freshness. */
  complete: boolean | null;
  scanned_to_block: string | null;
  deploy_block: string | null;
  head_block: string | null;
  /** The time of the last block the lane read, ISO 8601 UTC
   *  ("2026-11-27T17:57:24.000Z"), or null: the date a stored holding is
   *  "as of" when the head is unread. Absent on a server before 86173773. */
  scanned_to_timestamp?: string | null;
  /** How far behind the head the lane may sit and still read as complete. */
  fresh_within_blocks?: number;
}

/** The answer's state: "ok" serves the ledger; "incomplete" (the lane is
 *  still reading) and "too_heavy" (too many rows to replay) serve the head
 *  reads alone, with the ledger's figures and rows null. */
export type PethStatus = "ok" | "incomplete" | "too_heavy";

export interface PolarisPethResponse {
  address: string;
  deployment_id: string;
  /** Absent on a server before the fix round, which always served the ledger. */
  status?: PethStatus;
  /** Why the status is not "ok"; null when it is. */
  reason?: string | null;
  /** Gone from the server after the fix round: read `ledger.scanned_to_block`. */
  scanned_to_block?: string | null;
  /** Absent on a server before the fix round, which read the whole ledger. */
  ledger?: PethLedgerState | null;
  head: PethHeadStamp | null;
  head_unread_reason?: string | null;
  prices: PethHeadStamp & { spot_raw: string | null; floor_raw: string | null };
  figures: {
    eth_in: PethLedgerFigure;
    eth_out: PethLedgerFigure;
    curve_fees_paid: PethLedgerFigure;
    peth_held: PethHeadStamp & {
      raw: string | null;
      head_raw: string | null;
      stored_raw: string | null;
      stored_block: string | null;
    };
  };
  rollup: PethRollup;
  total_rows: number | null;
  limit: number;
  offset: number;
  rows: PethLedgerRow[] | null;
  /** The rows per place over the whole ledger, a row once under each of its
   *  places; null unless status is "ok", absent on a server before ui-jobs
   *  872. (872 mirror.) */
  place_counts?: { place: PethPlace; rows: number }[] | null;
  code_sizes_read?: {
    read: number;
    cap?: number;
    page_outside_counterparties: number;
    capped: boolean;
    unread_reason?: string | null;
  };
}

/** The params the proxy forwards. */
export const POLARIS_PETH_PARAMS = ["limit", "offset"] as const;

export function polarisPethQuery(params: URLSearchParams | Record<string, string | undefined>): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]);
  const qs = new URLSearchParams();
  for (const k of POLARIS_PETH_PARAMS) {
    const v = get(k);
    if (v != null && v !== "" && /^\d+$/.test(v)) qs.set(k, v);
  }
  return qs.toString();
}

/** A read that reached the backend and came back not-ok. A 400 carries the
 *  route's reason (a protocol contract, an address too heavy to replay); the
 *  page states it. */
export class PolarisPethHttpError extends Error {
  readonly status: number;
  readonly reason: string | null;
  readonly code: string | null;
  constructor(status: number, statusText: string, reason: string | null = null, code: string | null = null) {
    super(`Polaris pETH account read failed: ${status} ${statusText}`);
    this.name = "PolarisPethHttpError";
    this.status = status;
    this.reason = reason;
    this.code = code;
  }
}

/** The reason and code a not-ok answer's body states, where it states one. */
export function pethErrorBody(body: unknown): { reason: string | null; code: string | null } {
  if (!body || typeof body !== "object") return { reason: null, code: null };
  const b = body as Record<string, unknown>;
  const details = Array.isArray(b.details) ? (b.details[0] as Record<string, unknown> | undefined) : undefined;
  const reason =
    (typeof b.reason === "string" && b.reason) ||
    (typeof details?.message === "string" && details.message) ||
    (typeof b.error === "string" && b.error) ||
    null;
  const code =
    (typeof b.status === "string" && b.status) ||
    (typeof b.code === "string" && b.code) ||
    (typeof details?.code === "string" && details.code) ||
    null;
  return { reason, code };
}

/** One read of the route: through the proxy from the browser (`baseUrl`
 *  absent), or the box from a server render. */
export async function readPolarisPeth(
  address: string,
  params: Record<string, string | undefined>,
  opts: { baseUrl?: string; headers?: HeadersInit; signal?: AbortSignal } = {},
): Promise<PolarisPethResponse> {
  const qs = polarisPethQuery(params);
  const url = `${opts.baseUrl ?? ""}/api/polaris/peth/${address}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { cache: "no-store", headers: opts.headers, signal: opts.signal });
  if (!res.ok) {
    const { reason, code } = pethErrorBody(await res.json().catch(() => null));
    throw new PolarisPethHttpError(res.status, res.statusText, reason, code);
  }
  return (await res.json()) as PolarisPethResponse;
}
