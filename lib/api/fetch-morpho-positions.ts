// ============================================================================
// FETCH MORPHO POSITIONS
// ============================================================================
//
// Discovery list for the /morpho page. A Morpho borrower position is keyed by
// (marketId, owner) → one row per (market, owner). Reads the LIVE rails-server
// index (structural filter/sort/paginate over mv_morpho_positions, params
// decoded + symbols resolved in the proxy). Returns the { success, data,
// pagination } envelope.

import type {
  MorphoPositionSummary,
  MorphoPositionStatus,
  MorphoPositionSort,
} from "@/lib/sources/api/morpho-positions";

export interface FetchMorphoPositionsParams {
  /** marketId hex (with or without 0x) — restrict to one market, or to a CSV of
   *  market ids (the L1 route; see MORPHO_MARKET_CSV_CAP for the ceiling). */
  market?: string;
  /** Loan token, as a CSV of ERC-20 addresses — the L1 listing's Loan facet.
   *  Addresses rather than market ids because one loan token spans hundreds of
   *  markets (USDC alone ~503); see lib/morpho/list-filter-dimensions. */
  loan?: string;
  /** Collateral token, same shape as `loan`. */
  coll?: string;
  /** borrower address. */
  user?: string;
  status?: MorphoPositionStatus[];
  /** Debt-side facets — honoured by the Base listing route, which filters on
   *  the chain read; the Ethereum proxy has no such column and ignores them. */
  hasDebt?: boolean;
  noDebt?: boolean;
  hasLiquidations?: boolean;
  /** The Ethereum route's in-memory sort keys, or the Base route's
   *  recent/debt/coll (baseMorpho.ts's SORT_BY) — each backend recognises only
   *  its own set and falls back to its own default otherwise. */
  sortBy?: MorphoPositionSort | "recent" | "debt" | "coll";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
  /** The listing route to hit — this deployment's Morpho proxy by default;
   *  the Base listing passes /api/morpho-base/positions. */
  route?: string;
}

export interface MorphoPositionsResult {
  data: MorphoPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchMorphoPositions(p: FetchMorphoPositionsParams): Promise<MorphoPositionsResult> {
  const qs = new URLSearchParams();
  if (p.market) qs.set("market", p.market);
  if (p.loan) qs.set("loan", p.loan);
  if (p.coll) qs.set("coll", p.coll);
  if (p.user) qs.set("user", p.user);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.hasLiquidations != null) qs.set("hasLiquidations", String(p.hasLiquidations));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}${p.route ?? "/api/morpho/positions"}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchMorphoPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: MorphoPositionSummary[];
    pagination?: MorphoPositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
