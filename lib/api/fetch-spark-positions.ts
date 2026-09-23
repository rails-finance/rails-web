// ============================================================================
// FETCH SPARK POSITIONS
// ============================================================================
//
// Discovery list for the /spark page. A SparkLend position is one cross-
// collateralised account per wallet, so the grain is one row per wallet. The
// only arm is "api" — the LIVE rails-server index (structural filter/sort/
// paginate over mv_spark_positions, symbols resolved in the proxy). Returns the
// { success, data, pagination } envelope.

import type { SparkPositionSummary, SparkPositionStatus, SparkPositionSort } from "@/lib/sources/api/spark-positions";

export interface FetchSparkPositionsParams {
  /** wallet address — restrict to one account. */
  wallet?: string;
  hasDebt?: boolean;
  noDebt?: boolean;
  hasLiquidations?: boolean;
  /** supply-side reserve symbols/addresses — restrict to positions supplying them. */
  supplyAssets?: string[];
  borrowAssets?: string[];
  status?: SparkPositionStatus[];
  sortBy?: SparkPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface SparkPositionsResult {
  data: SparkPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchSparkPositions(p: FetchSparkPositionsParams): Promise<SparkPositionsResult> {
  const qs = new URLSearchParams();
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.hasLiquidations != null) qs.set("hasLiquidations", String(p.hasLiquidations));
  if (p.supplyAssets && p.supplyAssets.length > 0) qs.set("supplyAssets", p.supplyAssets.join(","));
  if (p.borrowAssets && p.borrowAssets.length > 0) qs.set("borrowAssets", p.borrowAssets.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/spark/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchSparkPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: SparkPositionSummary[];
    pagination?: SparkPositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
