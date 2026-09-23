// ============================================================================
// FETCH ASYMMETRY TROVES
// ============================================================================
//
// Discovery list for the /asymmetry page. One row per Trove, keyed (branch, troveId).
// Served by the LIVE rails-server index (structural filter/sort/paginate over
// mv_asymmetry_positions, shaped in the proxy). Asymmetry has a small set (~91 Troves), so
// the page fetches them all once and filters in memory (memoryStrategy). Returns the
// { data, pagination } envelope.

import type {
  AsymmetryTroveSummary,
  AsymmetryTroveStatus,
  AsymmetryTroveSort,
} from "@/lib/sources/api/asymmetry-troves";

export interface FetchAsymmetryTrovesParams {
  troveId?: string;
  collateralTypes?: string[];
  status?: AsymmetryTroveStatus[];
  sortBy?: AsymmetryTroveSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface AsymmetryTrovesResult {
  data: AsymmetryTroveSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchAsymmetryTroves(p: FetchAsymmetryTrovesParams): Promise<AsymmetryTrovesResult> {
  const qs = new URLSearchParams();
  if (p.troveId) qs.set("troveId", p.troveId);
  if (p.collateralTypes && p.collateralTypes.length > 0) qs.set("collateralTypes", p.collateralTypes.join(","));
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/asymmetry/troves?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchAsymmetryTroves failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: AsymmetryTroveSummary[];
    pagination?: AsymmetryTrovesResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
