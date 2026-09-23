// ============================================================================
// FETCH FX POSITIONS
// ============================================================================
//
// Discovery list for the /fx page. One row per position NFT, keyed
// (pool, positionId). Served by the LIVE rails-server index; current
// collateral/debt/owner are the settled sweep values (the only valid source
// for f(x) current state). Returns the { success, data, pagination } envelope.

import type { FxPositionSummary, FxPositionStatus, FxPositionSort } from "@/lib/sources/api/fx-positions";
import type { FxPoolKey } from "@/lib/fx/asset-catalog";

export interface FetchFxPositionsParams {
  positionId?: string;
  owner?: string;
  pools?: FxPoolKey[];
  status?: (FxPositionStatus | "liquidated")[];
  sortBy?: FxPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface FxPositionsResult {
  data: FxPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchFxPositions(p: FetchFxPositionsParams): Promise<FxPositionsResult> {
  const qs = new URLSearchParams();
  if (p.positionId) qs.set("positionId", p.positionId);
  if (p.owner) qs.set("owner", p.owner);
  if (p.pools && p.pools.length > 0) qs.set("pools", p.pools.join(","));
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/fx/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchFxPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: FxPositionSummary[]; pagination?: FxPositionsResult["pagination"] };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
