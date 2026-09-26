// Alchemix V3 Transmuter positions — the backend reads.
// ----------------------------------------------------------------------------
// The listing and the one-position read, forwarded in the shape rails-server
// states them (`shapeTransmuter` in api/src/routes/alchemix.ts). The rule the
// Alchemist readers next door keep holds here too: nothing reshapes a figure.
//
// The key is (lineKey, nftId). A Transmuter id is an NFT id inside its line's
// own Transmuter, so the same number is a different position on every other
// line, and a different position again from the Alchemist position of that id.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AlchemixTransmuterPositionResponse, AlchemixTransmuterPositionsResponse } from "@/types/api/alchemix";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixRead } from "@/lib/sources/api/alchemix-position-backend";

export type AlchemixTransmuterPositionFullResponse = AlchemixTransmuterPositionResponse<BaseActivityEvent>;

/** The backend's sort vocabulary (`TRANSMUTER_SORTS` on the route). */
export type AlchemixTransmuterSort = "maturity" | "amount" | "created" | "nftId";

const SORTS: readonly AlchemixTransmuterSort[] = ["maturity", "amount", "created", "nftId"];
/** `maturing` and `matured` split `outstanding` in two against the indexed
 *  frontier; the facet offers those two and `claimed`, which never overlap. */
const STATUSES = ["maturing", "matured", "claimed", "outstanding"] as const;

export interface FetchAlchemixTransmuterPositionsParams {
  lines?: string[];
  chainId?: number;
  owner?: string;
  nftId?: string;
  status?: string[];
  sortBy?: AlchemixTransmuterSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

const keep = (values: string[] | undefined, allowed: readonly string[]): string[] =>
  (values ?? []).filter((v) => allowed.includes(v));

/** Decode the proxy's query string. Anything unrecognised is dropped, so a
 *  stale URL still lists rather than drawing the backend's 400. */
export function parseAlchemixTransmuterQuery(sp: URLSearchParams): FetchAlchemixTransmuterPositionsParams {
  const list = (key: string) =>
    (sp.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const num = (key: string) => {
    const raw = sp.get(key);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const sortBy = sp.get("sortBy");
  const owner = sp.get("owner");
  const nftId = sp.get("nftId");
  return {
    lines: list("line"),
    chainId: num("chainId"),
    owner: owner && /^0x[a-fA-F0-9]{40}$/.test(owner) ? owner.toLowerCase() : undefined,
    nftId: nftId && /^\d+$/.test(nftId) ? nftId : undefined,
    status: keep(list("status"), STATUSES),
    sortBy: SORTS.includes(sortBy as AlchemixTransmuterSort) ? (sortBy as AlchemixTransmuterSort) : undefined,
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
    limit: num("limit"),
    offset: num("offset"),
  };
}

export function alchemixTransmuterQuery(p: FetchAlchemixTransmuterPositionsParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (p.lines && p.lines.length > 0) qs.set("line", p.lines.join(","));
  if (p.chainId != null) qs.set("chainId", String(p.chainId));
  if (p.owner) qs.set("owner", p.owner);
  if (p.nftId) qs.set("nftId", p.nftId);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  qs.set("sortOrder", p.sortOrder === "asc" ? "asc" : "desc");
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs;
}

async function read<T>(path: string, readerIp?: string, signal?: AbortSignal): Promise<AlchemixRead<T>> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const response = await fetch(`${base}${path}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
  return { ok: true, upstream: response, result: (await response.json()) as T };
}

export function readAlchemixTransmuterPositions(
  p: FetchAlchemixTransmuterPositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixTransmuterPositionsResponse>> {
  return read<AlchemixTransmuterPositionsResponse>(
    `/api/alchemix/transmuter/positions?${alchemixTransmuterQuery(p).toString()}`,
    readerIp,
    signal,
  );
}

export function readAlchemixTransmuterPosition(
  lineKey: string,
  nftId: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixTransmuterPositionFullResponse>> {
  return read<AlchemixTransmuterPositionFullResponse>(
    `/api/alchemix/transmuter/position/${encodeURIComponent(lineKey)}/${encodeURIComponent(nftId)}`,
    readerIp,
    signal,
  );
}
