// ============================================================================
// FETCH DOLOMITE POSITIONS
// ============================================================================
//
// Discovery list for the /dolomite page. The GRAIN IS THE PAIR — one row per
// Account.Info = (owner, uint256 accountNumber), the contract's own key:
// cross-margin within an account number, isolated across them, so an owner
// with three Borrow Positions is three rows with three independent risk
// stories. The only arm is "api" — the LIVE rails-server index (structural
// filter/sort/paginate over mv_dolomite_positions; market identity + chain
// state resolved in the proxy). Returns the { success, data, pagination }
// envelope.

import type {
  DolomitePositionSummary,
  DolomitePositionStatus,
  DolomitePositionSort,
} from "@/lib/sources/api/dolomite-positions";

export interface FetchDolomitePositionsParams {
  /** Restrict to one owner (all its account numbers). */
  owner?: string;
  /** With `owner`: restrict to exactly one Account.Info. STRING — uint256. */
  accountNumber?: string;
  /** Borrowing (any par < 0) / lending only. */
  hasDebt?: boolean;
  noDebt?: boolean;
  /** Ever liquidated — the orthogonal flag, NOT the lifecycle status: open
   *  survivors match too. */
  hasLiquidations?: boolean;
  /** Account kind — "balance" (account 0, the Dolomite Balance) or "borrow"
   *  (isolated Borrow Positions). The backend's own param vocabulary. */
  kind?: "balance" | "borrow";
  status?: DolomitePositionStatus[];
  sortBy?: DolomitePositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface DolomitePositionsResult {
  data: DolomitePositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchDolomitePositions(p: FetchDolomitePositionsParams): Promise<DolomitePositionsResult> {
  const qs = new URLSearchParams();
  if (p.owner) qs.set("owner", p.owner);
  if (p.accountNumber != null) qs.set("accountNumber", p.accountNumber);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.hasLiquidations != null) qs.set("hasLiquidations", String(p.hasLiquidations));
  if (p.kind) qs.set("kind", p.kind);
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/dolomite/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchDolomitePositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: DolomitePositionSummary[];
    pagination?: DolomitePositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
