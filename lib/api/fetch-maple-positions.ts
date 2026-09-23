// ============================================================================
// FETCH MAPLE POSITIONS
// ============================================================================
//
// Discovery list for the /maple page. A Maple position is one wallet's lender
// stake across the syrup pools, so the grain is one row per wallet. The only
// arm is "api" — the LIVE rails-server index (structural filter/sort/paginate
// over mv_maple_wallets, pool catalog + chain state resolved in the proxy).
// Returns the { success, data, poolState, pagination } envelope — poolState
// (per-pool exit/NAV rates + the liquid/deployed split) feeds the access band
// and the detail card from the same fetch.

import type { MaplePositionSummary, MaplePositionStatus, MaplePositionSort } from "@/lib/sources/api/maple-positions";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";

export interface FetchMaplePositionsParams {
  /** wallet address — restrict to one account. */
  wallet?: string;
  /** Positions currently waiting in the withdrawal queue. */
  inQueue?: boolean;
  /** Share-token symbols — restrict to wallets holding those pools. */
  pools?: string[];
  status?: MaplePositionStatus[];
  sortBy?: MaplePositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface MaplePositionsResult {
  data: MaplePositionSummary[];
  poolState: Record<string, MaplePoolState>;
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchMaplePositions(p: FetchMaplePositionsParams): Promise<MaplePositionsResult> {
  const qs = new URLSearchParams();
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.inQueue != null) qs.set("inQueue", String(p.inQueue));
  if (p.pools && p.pools.length > 0) qs.set("pools", p.pools.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/maple/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchMaplePositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: MaplePositionSummary[];
    poolState?: Record<string, MaplePoolState>;
    pagination?: MaplePositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    poolState: json.poolState ?? {},
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
