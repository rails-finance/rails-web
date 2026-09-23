// ============================================================================
// FETCH FRANKENCOIN POSITIONS
// ============================================================================
//
// Discovery list for the /frankencoin page. THE GRAIN IS THE POSITION
// CONTRACT — one row per Position clone (the address is the identity); `q`
// searches by owner ("this owner's positions", plural on purpose: one owner
// can hold many independent Position contracts, each with its own collateral,
// declared price and expiry). The only arm is "api" — the LIVE rails-server
// index (structural filter/sort/paginate at the position grain). Returns the
// { success, data, pagination } envelope. Native units only.

import type {
  FrankencoinPositionSummary,
  FrankencoinPositionStatus,
  FrankencoinPositionSort,
} from "@/lib/sources/api/frankencoin-positions";

export interface FetchFrankencoinPositionsParams {
  /** Restrict to exactly one Position contract. */
  position?: string;
  /** Restrict to one owner's positions (replayed, transfer-honored owner). */
  owner?: string;
  status?: FrankencoinPositionStatus[];
  /** Restrict to one hub generation. */
  hub?: "v1" | "v2";
  /** Ever challenged — the orthogonal flag, NOT the lifecycle status: open
   *  survivors match too (a challenged position can survive). */
  everChallenged?: boolean;
  /** At least one ChallengeSucceeded slice (the harder orthogonal flag). */
  challengeSucceeded?: boolean;
  sortBy?: FrankencoinPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  /** Cancels the request — the listing SSR passes its timeout here. */
  signal?: AbortSignal;
  /** The signed reader headers the SSR hop carries (lib/shared/listing-ssr.ts `ssrHop`). */
  headers?: HeadersInit;
}

export interface FrankencoinPositionsResult {
  data: FrankencoinPositionSummary[];
  pagination: { total: number; limit: number; offset: number };
}

export async function fetchFrankencoinPositions(
  p: FetchFrankencoinPositionsParams,
): Promise<FrankencoinPositionsResult> {
  const qs = new URLSearchParams();
  if (p.position) qs.set("position", p.position);
  if (p.owner) qs.set("owner", p.owner);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hub) qs.set("hub", p.hub);
  if (p.everChallenged != null) qs.set("everChallenged", String(p.everChallenged));
  if (p.challengeSucceeded != null) qs.set("challengeSucceeded", String(p.challengeSucceeded));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  if (p.sortOrder) qs.set("sortOrder", p.sortOrder);
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const url = `${p.baseUrl ?? ""}/api/frankencoin/positions?${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal: p.signal, headers: p.headers });
  if (!res.ok) throw new Error(`fetchFrankencoinPositions failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as {
    data?: FrankencoinPositionSummary[];
    pagination?: FrankencoinPositionsResult["pagination"];
  };
  return {
    data: json.data ?? [],
    pagination: json.pagination ?? { total: json.data?.length ?? 0, limit: p.limit ?? 50, offset: p.offset ?? 0 },
  };
}
