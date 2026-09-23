// ============================================================================
// FETCH MAKERDAO VAULTS
// ============================================================================
//
// Discovery list for the /makerdao page. One row per vault (urn). Served by the LIVE
// rails-server index (structural filter/sort/paginate over mv_makerdao_positions ⋈
// maker_ilk_state, shaped in the proxy). Returns the { success, data, pagination }
// envelope.

import type { MakerVaultSummary, MakerVaultStatus, MakerVaultSort } from "@/lib/sources/api/makerdao-vaults";

export interface FetchMakerVaultsParams {
  cdpId?: string;
  /** Urn-address lookup — the cdp-less identity (LockStake engine urns). */
  urn?: string;
  owner?: string;
  ilks?: string[];
  status?: MakerVaultStatus[];
  sortBy?: MakerVaultSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface MakerVaultsResult {
  data: MakerVaultSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchMakerVaults(p: FetchMakerVaultsParams): Promise<MakerVaultsResult> {
  const qs = new URLSearchParams();
  if (p.cdpId) qs.set("cdpId", p.cdpId);
  if (p.urn) qs.set("urn", p.urn);
  if (p.owner) qs.set("owner", p.owner);
  if (p.ilks && p.ilks.length > 0) qs.set("ilks", p.ilks.join(","));
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const prefix = "/api/makerdao/vaults";
  const url = `${p.baseUrl ?? ""}${prefix}?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchMakerVaults failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data?: MakerVaultSummary[]; pagination?: MakerVaultsResult["pagination"] };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
