// ============================================================================
// FETCH LIQUITY V1 POSITIONS
// ============================================================================
//
// Discovery list for the /liquity-v1 page. A Liquity V1 position is one Trove per
// wallet (exactly one Trove per address), so the grain is one row per wallet. The
// only arm is "api" — the LIVE rails-server index (structural filter/sort/paginate
// over mv_liquity_v1_positions). Returns the { data, pagination } envelope.

import type {
  LiquityV1PositionSummary,
  LiquityV1PositionStatus,
  LiquityV1PositionSort,
} from "@/lib/sources/api/liquity-v1-positions";

export interface FetchLiquityV1PositionsParams {
  wallet?: string;
  hasDebt?: boolean;
  noDebt?: boolean;
  /** ever liquidated (liquidationCount > 0), orthogonal to current status. */
  hasLiquidations?: boolean;
  /** ever redeemed against (redemptionCount > 0), orthogonal to current status. */
  hasRedemptions?: boolean;
  status?: LiquityV1PositionStatus[];
  sortBy?: LiquityV1PositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface LiquityV1PositionsResult {
  data: LiquityV1PositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchLiquityV1Positions(p: FetchLiquityV1PositionsParams): Promise<LiquityV1PositionsResult> {
  const qs = new URLSearchParams();
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.hasLiquidations != null) qs.set("hasLiquidations", String(p.hasLiquidations));
  if (p.hasRedemptions != null) qs.set("hasRedemptions", String(p.hasRedemptions));
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/liquity-v1/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchLiquityV1Positions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: LiquityV1PositionSummary[];
    pagination?: LiquityV1PositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
