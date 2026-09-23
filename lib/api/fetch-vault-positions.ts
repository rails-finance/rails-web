// ============================================================================
// FETCH VAULT POSITIONS (Aave's vault layer on Ethereum)
// ============================================================================
//
// The discovery list for each vault layer's positions. One row per `(vault,
// holder)` pair, paged against the stored census through this app's own
// /api/vaults/positions proxy — which also adds the live overlay for the cards
// on the page (one Multicall3 batch at one block) before answering.
//
// Mirrors fetch-troves: the only arm is the proxy, it returns the
// `{ data, pagination }` envelope plus the census header, and it takes an
// optional `baseUrl` so the SSR first paint can call the SAME function pointed
// at this deployment's own origin — one code path, server or client.

import type { VaultPositionsResult } from "@/lib/aave-vaults/vault-position";

export interface FetchVaultPositionsParams {
  chainId?: number;
  /** A vault address — the listing's `vault` facet. */
  vault?: string;
  family?: string;
  /** "live" | "closed". Omit for both, which is the resting view. */
  status?: string;
  shape?: string;
  /** Free-text: an address, or a fragment of one. Matched against the holder. */
  q?: string;
  /** The `Size` facet's wire value: a whole-dollar lower bound ("1000",
   *  "10000" …) or "unpriced" for exactly the rows the census's oracle could
   *  not price. Omit for every row, which is the resting view. */
  size?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Skip the live overlay (the verifier's census-only path). */
  overlay?: boolean;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export async function fetchVaultPositions(p: FetchVaultPositionsParams): Promise<VaultPositionsResult> {
  const qs = new URLSearchParams();
  qs.set("chain", String(p.chainId ?? 1));
  if (p.vault) qs.set("vault", p.vault);
  if (p.family) qs.set("family", p.family);
  if (p.status) qs.set("status", p.status);
  if (p.shape) qs.set("shape", p.shape);
  if (p.q) qs.set("q", p.q);
  if (p.size) qs.set("size", p.size);
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  if (p.overlay === false) qs.set("overlay", "0");

  const url = `${p.baseUrl ?? ""}/api/vaults/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchVaultPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as Partial<VaultPositionsResult>;
  return {
    data: json.data ?? [],
    pagination: {
      total: json.pagination?.total ?? json.data?.length ?? 0,
      limit: json.pagination?.limit ?? p.limit ?? 20,
      offset: json.pagination?.offset ?? p.offset ?? 0,
    },
    census: json.census ?? [],
    blockNumber: json.blockNumber ?? null,
    finalizedBlock: json.finalizedBlock ?? null,
  };
}
