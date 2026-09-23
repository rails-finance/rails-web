// ============================================================================
// FETCH TROVES (Liquity V2)
// ============================================================================
//
// Discovery list for the /liquity-v2 page. One row per Trove (TroveSummary),
// paged against the live rails-server index through this app's own /api/troves
// proxy (which resolves the status buckets onto (status, is_zombie) predicates
// and forward-resolves ENS). Mirrors fetch-liquity-v1-positions: the only arm is
// the api index; it returns the { data, pagination } envelope, and takes an
// optional `baseUrl` for the SSR first-paint fetch (the same client fetch pointed
// at this deployment's origin, so it flows through the proxy — one code path).

import type { TroveSummary } from "@/types/api/trove";

export interface FetchTrovesParams {
  troveId?: string;
  /** Status buckets (active / zombie / closed / liquidated). Omit for the full
   *  set ("show everything"), which the backend reads as no status filter. */
  status?: string[];
  collateralTypes?: string[];
  ownerAddress?: string;
  ownerEns?: string;
  hasRedemptions?: boolean;
  batchOnly?: boolean;
  individualOnly?: boolean;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface TrovesResult {
  data: TroveSummary[];
  pagination: { total: number; limit: number; offset: number };
}

/** The typed params as the /api/troves proxy reads them. One mapping: the
 *  browser and the SSR first paint send it over HTTP through `fetchTroves`,
 *  and the wallet share-image route hands the same params straight to the
 *  proxy's backend read in process (lib/sources/api/troves-backend.ts). */
export function trovesQuery(p: FetchTrovesParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (p.troveId) qs.set("troveId", p.troveId);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.collateralTypes && p.collateralTypes.length > 0) qs.set("collateralTypes", p.collateralTypes.join(","));
  if (p.ownerAddress) qs.set("ownerAddress", p.ownerAddress);
  if (p.ownerEns) qs.set("ownerEns", p.ownerEns);
  if (p.hasRedemptions != null) qs.set("hasRedemptions", String(p.hasRedemptions));
  if (p.batchOnly) qs.set("batchOnly", "true");
  if (p.individualOnly) qs.set("individualOnly", "true");
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs;
}

export async function fetchTroves(p: FetchTrovesParams): Promise<TrovesResult> {
  const qs = trovesQuery(p);

  const url = `${p.baseUrl ?? ""}/api/troves?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchTroves failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: TroveSummary[];
    pagination?: { total?: number; limit?: number; offset?: number };
  };
  return {
    data: json.data ?? [],
    pagination: {
      total: json.pagination?.total ?? json.data?.length ?? 0,
      limit: json.pagination?.limit ?? p.limit ?? 20,
      offset: json.pagination?.offset ?? p.offset ?? 0,
    },
  };
}
