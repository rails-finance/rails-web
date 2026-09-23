// ============================================================================
// FETCH LLAMALEND POSITIONS
// ============================================================================
//
// Discovery list for the /llamalend page. The GRAIN IS THE PAIR — one row per
// (controller, user): each controller is an isolated market (one collateral,
// one borrowed token) liquidated independently, so a user active in three
// markets is three rows with three independent risk stories. The only arm is
// "api" — the LIVE rails-server index (structural filter/sort/paginate over
// mv_llamalend_positions; market identity + the per-position soft-liq
// overlay resolved in the proxy). Returns the { success, data, pagination }
// envelope.

import type {
  LlamalendPositionSummary,
  LlamalendPositionStatus,
  LlamalendPositionSort,
} from "@/lib/sources/api/llamalend-positions";

export interface FetchLlamalendPositionsParams {
  /** Restrict to one user (all their markets). */
  user?: string;
  /** Restrict to one market (the controller address — the isolated-market
   *  key). With `user`: exactly one position. */
  controller?: string;
  status?: LlamalendPositionStatus[];
  /** Ever hard-liquidated — the orthogonal flag, NOT the lifecycle status:
   *  open survivors match too. */
  hasLiquidations?: boolean;
  sortBy?: LlamalendPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface LlamalendPositionsResult {
  data: LlamalendPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchLlamalendPositions(p: FetchLlamalendPositionsParams): Promise<LlamalendPositionsResult> {
  const qs = new URLSearchParams();
  if (p.user) qs.set("user", p.user);
  if (p.controller) qs.set("controller", p.controller);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hasLiquidations != null) qs.set("hasLiquidations", String(p.hasLiquidations));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/llamalend/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchLlamalendPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: LlamalendPositionSummary[];
    pagination?: LlamalendPositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
