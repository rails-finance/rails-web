// Alchemix V3 position listing — the backend read.
// ----------------------------------------------------------------------------
// rails-server does all the structural work: filter, sort and paginate over the
// reduced per-position state at the (lineKey, tokenId) grain, join the head
// chain reading, and grade the figures. It answers with the finished shape,
// down to the sentence that states the grade in words, so nothing here reshapes
// a figure — this module validates the query and forwards it.
//
// THAT IS DELIBERATE, NOT LAZINESS. Every figure on that wire is paired with
// the block it is true at. A transform here that dropped a block, defaulted one,
// or moved an amount between figures would produce a number that still looked
// stated. The earmarked figure is the sharp case: it accrues every block, so it
// is only ever true at its own `asOfBlock` — a reshaper that carried it forward
// or summed it into debt would be inventing a reading. Forwarding the shape
// whole is what makes that impossible.
//
// PAGINATION IS `limit`/`offset`, the listing idiom. The route caps `offset` at
// 10,000 and asks for filters instead of deep paging, so a page past that
// returns the backend's own refusal rather than an empty list.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AlchemixPositionsResponse } from "@/types/api/alchemix";

/** The backend's own sort vocabulary (`LISTING_SORTS` on the route). */
export type AlchemixPositionSort = "lastActivity" | "created" | "debt" | "collateral" | "tokenId";

const SORTS: readonly AlchemixPositionSort[] = ["lastActivity", "created", "debt", "collateral", "tokenId"];
const STATUSES = ["open", "closed", "refused", "unknown"] as const;
const GRADES = ["derived", "read", "unavailable", "refused"] as const;

export interface FetchAlchemixPositionsParams {
  /** Comma-joined on the wire. Every key must be a line on `chainId` — the
   *  caller gates that (lib/alchemix/lines.ts), because a line key alone does
   *  not name its chain. */
  lines?: string[];
  /** Which chain's lines to list. The half of the position's identity the line
   *  key does not carry, and what separates the two Alchemix explorers. */
  chainId?: number;
  owner?: string;
  tokenId?: string;
  status?: string[];
  grade?: string[];
  sortBy?: AlchemixPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Set on the SSR hop so the fetch reaches this deployment's own proxy. */
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export type AlchemixPositionsRead =
  | { ok: true; result: AlchemixPositionsResponse; upstream: Response }
  | { ok: false; status: number; statusText: string };

const keep = (values: string[] | undefined, allowed: readonly string[]): string[] =>
  (values ?? []).filter((v) => allowed.includes(v));

/** Decode the proxy's query string into the params the backend read takes.
 *  Anything unrecognised is dropped rather than forwarded: the backend answers
 *  an unknown status or grade with a 400, and a stale URL should still list. */
export function parseAlchemixPositionsQuery(sp: URLSearchParams): FetchAlchemixPositionsParams {
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
  const tokenId = sp.get("tokenId");
  return {
    lines: list("line"),
    chainId: num("chainId"),
    owner: owner && /^0x[a-fA-F0-9]{40}$/.test(owner) ? owner.toLowerCase() : undefined,
    tokenId: tokenId && /^\d+$/.test(tokenId) ? tokenId : undefined,
    status: keep(list("status"), STATUSES),
    grade: keep(list("grade"), GRADES),
    sortBy: SORTS.includes(sortBy as AlchemixPositionSort) ? (sortBy as AlchemixPositionSort) : undefined,
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
    limit: num("limit"),
    offset: num("offset"),
  };
}

export function alchemixPositionsQuery(p: FetchAlchemixPositionsParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (p.lines && p.lines.length > 0) qs.set("line", p.lines.join(","));
  if (p.chainId != null) qs.set("chainId", String(p.chainId));
  if (p.owner) qs.set("owner", p.owner);
  if (p.tokenId) qs.set("tokenId", p.tokenId);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.grade && p.grade.length > 0) qs.set("grade", p.grade.join(","));
  // `lastActivity` is the backend's own default and is never sent by name.
  if (p.sortBy && p.sortBy !== "lastActivity") qs.set("sortBy", p.sortBy);
  qs.set("sortOrder", p.sortOrder === "asc" ? "asc" : "desc");
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs;
}

export async function readAlchemixPositionsFromBackend(
  p: FetchAlchemixPositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixPositionsRead> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");

  const response = await fetch(`${base}/api/alchemix/positions?${alchemixPositionsQuery(p).toString()}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
  return { ok: true, upstream: response, result: (await response.json()) as AlchemixPositionsResponse };
}
