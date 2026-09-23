// ============================================================================
// FETCH POLARIS POSITIONS
// ============================================================================
//
// Discovery list for /sepolia/polaris. THE GRAIN IS (market, cdpId); `wallet`
// filters by the current holder (the last NFT transfer's recipient). The only
// arm is "api" — the LIVE rails-server index (structural filter/sort/paginate
// at the CDP grain). Returns the { data, pagination, markets } envelope.

import type {
  PolarisPositionSummary,
  PolarisPositionStatus,
  PolarisPositionSort,
  PolarisMarketBook,
} from "@/lib/sources/api/polaris-positions";
import type { PolarisMarket } from "@/lib/polaris/asset-catalog";

export interface FetchPolarisPositionsParams {
  market?: PolarisMarket;
  /** Restrict to exactly one CDP (with `market`). */
  cdpId?: string;
  /** Restrict to one holder's CDPs. */
  wallet?: string;
  status?: PolarisPositionStatus[];
  /** Only CDPs whose last state carries debt. */
  /** true → the last state carries debt; false → collateral only (pETH
   *  deposited, nothing minted); undefined → both. */
  hasDebt?: boolean;
  sortBy?: PolarisPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface PolarisPositionsResult {
  data: PolarisPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
  /** The replayed book per market, as the index states it beside the page. */
  markets: PolarisMarketBook[];
}

export async function fetchPolarisPositions(p: FetchPolarisPositionsParams): Promise<PolarisPositionsResult> {
  const qs = new URLSearchParams();
  if (p.market) qs.set("market", p.market);
  if (p.cdpId) qs.set("id", p.cdpId);
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hasDebt != null) qs.set("hasDebt", p.hasDebt ? "1" : "0");
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/polaris/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchPolarisPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: PolarisPositionSummary[];
    pagination?: PolarisPositionsResult["pagination"];
    markets?: PolarisMarketBook[];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
    markets: json.markets ?? [],
  };
}

/** One CDP's listing row, or null. Asks with `id` and KEEPS THE ANSWER ONLY
 *  WHEN IT NAMES THIS CDP. The index does filter by id now — re-measured
 *  2026-09-10: `?market=usdp&id=27` answers that one row, and a bare `?id=27`
 *  answers the number in both markets (usdp/27 + goldp/27) — but on 2026-09-05
 *  it answered its default page to an id, so the guard stays: an unchecked
 *  `data[0]` would be another CDP's row against an index that regressed. The
 *  page derives the same facts from the CDP's own timeline when this answers
 *  null (lib/polaris/summary-from-events.ts). */
export async function fetchPolarisPositionSummary(
  market: PolarisMarket,
  cdpId: string,
  baseUrl?: string,
  headers?: HeadersInit,
): Promise<PolarisPositionSummary | null> {
  const r = await fetchPolarisPositions({
    market,
    cdpId,
    status: ["open", "closed", "liquidated"],
    limit: 1,
    baseUrl,
    headers,
  });
  const row = r.data[0];
  return row && row.market === market && row.cdpId === cdpId ? row : null;
}
