// ============================================================================
// FETCH FLUID POSITIONS
// ============================================================================
//
// The Fluid discovery listing: one row per position NFT (Σ replay lane + the
// settled overlay at head when present). Wallet lookup filters by the NFT's
// current owner.

import type { FluidPositionSummary, FluidPositionStatus } from "@/lib/sources/api/fluid-positions";

export interface FetchFluidPositionsParams {
  wallet?: string;
  nft?: string;
  hasDebt?: boolean;
  noDebt?: boolean;
  wasLiquidated?: boolean;
  status?: FluidPositionStatus[];
  supplyAssets?: string[];
  borrowAssets?: string[];
  vaultKind?: "t1" | "smart";
  sortBy?: "lastActivity" | "debt" | "collateral" | "events";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface FluidPositionsResult {
  data: FluidPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchFluidPositions(p: FetchFluidPositionsParams = {}): Promise<FluidPositionsResult> {
  const qs = new URLSearchParams();
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.nft) qs.set("nft", p.nft);
  if (p.hasDebt) qs.set("hasDebt", "true");
  if (p.noDebt) qs.set("noDebt", "true");
  if (p.wasLiquidated != null) qs.set("wasLiquidated", String(p.wasLiquidated));
  if (p.status?.length) qs.set("status", p.status.join(","));
  if (p.supplyAssets?.length) qs.set("supplyAssets", p.supplyAssets.join(","));
  if (p.borrowAssets?.length) qs.set("borrowAssets", p.borrowAssets.join(","));
  if (p.vaultKind) qs.set("vaultKind", p.vaultKind);
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/fluid/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) {
    throw new Error(`fetchFluidPositions failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    success: boolean;
    data: FluidPositionSummary[];
    pagination: { total: number; limit: number; offset: number };
  };
  return { data: json.data ?? [], pagination: json.pagination ?? { total: 0, limit: 20, offset: 0 } };
}
