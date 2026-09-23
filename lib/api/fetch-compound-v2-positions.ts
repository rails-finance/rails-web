// ============================================================================
// FETCH COMPOUND V2 POSITIONS
// ============================================================================
//
// Discovery list for the /compound-v2 page. A Compound V2 position is one
// cross-collateralised Comptroller account per wallet — the Comptroller pools
// all twenty markets into one risk question, so the grain is one row per
// wallet (the opposite of Compound V3's per-Comet shape). The only arm is
// "api" — the LIVE rails-server index (structural filter/sort/paginate over
// mv_compound_v2_wallets, market catalog + chain state resolved in the proxy).
// Returns the { success, data, pagination } envelope.

import type {
  CompoundV2PositionSummary,
  CompoundV2PositionStatus,
  CompoundV2PositionSort,
} from "@/lib/sources/api/compound-v2-positions";

export interface FetchCompoundV2PositionsParams {
  /** wallet address — restrict to one account. */
  wallet?: string;
  hasDebt?: boolean;
  noDebt?: boolean;
  /** Ever liquidated — the orthogonal flag, NOT the lifecycle status: open
   *  survivors match too (close factor 0.5 → borrowers commonly live on). */
  hasLiquidations?: boolean;
  /** supply-side underlying symbols — restrict to positions supplying them. */
  supplyAssets?: string[];
  borrowAssets?: string[];
  status?: CompoundV2PositionStatus[];
  sortBy?: CompoundV2PositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface CompoundV2PositionsResult {
  data: CompoundV2PositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchCompoundV2Positions(p: FetchCompoundV2PositionsParams): Promise<CompoundV2PositionsResult> {
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

  const url = `${p.baseUrl ?? ""}/api/compound-v2/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchCompoundV2Positions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: CompoundV2PositionSummary[];
    pagination?: CompoundV2PositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
