// ============================================================================
// FETCH COMPOUND POSITIONS
// ============================================================================
//
// Discovery list for the /compound page. Comet is single-base / multi-collateral,
// so the grain is one row per (market, account) — a wallet can hold a position in
// each of the captured markets (cUSDCv3 / cWETHv3 / cUSDTv3). The only arm is
// "api" — the LIVE rails-server index (structural filter/sort/paginate over
// mv_compound_v3_positions, collateral lines joined in the proxy). Returns the
// { data, pagination } envelope.

import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";
import type {
  CompoundPositionSummary,
  CompoundPositionStatus,
  CompoundPositionSort,
} from "@/lib/sources/api/compound-positions";

export interface FetchCompoundPositionsParams {
  /** market slug — restrict to one Comet market. */
  market?: string;
  /** wallet address — restrict to one account. */
  wallet?: string;
  /** borrowing positions (signed base < 0). */
  hasDebt?: boolean;
  /** non-borrowing positions (signed base ≥ 0). */
  noDebt?: boolean;
  hasLiquidations?: boolean;
  status?: CompoundPositionStatus[];
  sortBy?: CompoundPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** The listing route to hit — this deployment's Compound V3 proxy by default;
   *  the Base lane names its own (`/api/compound-base/positions`). */
  route?: string;
}

export interface CompoundPositionsResult {
  data: CompoundPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
  /** How complete the lane is — present on the Base listing only. */
  coverage?: BaseLendingCoverage | null;
}

export async function fetchCompoundPositions(p: FetchCompoundPositionsParams): Promise<CompoundPositionsResult> {
  const qs = new URLSearchParams();
  if (p.market) qs.set("market", p.market);
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.hasLiquidations != null) qs.set("hasLiquidations", String(p.hasLiquidations));
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}${p.route ?? "/api/compound/positions"}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchCompoundPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: CompoundPositionSummary[];
    pagination?: CompoundPositionsResult["pagination"];
    coverage?: BaseLendingCoverage | null;
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
    coverage: json.coverage,
  };
}
