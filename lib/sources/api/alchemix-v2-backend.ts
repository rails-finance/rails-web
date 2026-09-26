// Alchemix V2: the backend reads.
// ----------------------------------------------------------------------------
// The listing and the one-account read, forwarded in the shape rails-server
// states them (`routes/alchemix-v2.ts`). Nothing reshapes a figure: every
// figure on that wire carries the frozen block it was read at.
//
// The key is (lineKey, account). V2 is wallet-keyed, so the account is the
// position, and an account on one line says nothing about the other.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AlchemixV2PositionResponse, AlchemixV2PositionsResponse } from "@/types/api/alchemix";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AlchemixRead } from "@/lib/sources/api/alchemix-position-backend";

export type AlchemixV2PositionFullResponse = AlchemixV2PositionResponse<BaseActivityEvent>;

/** The backend's sort vocabulary. */
export type AlchemixV2Sort = "lastActivity" | "debt" | "created" | "events";

const SORTS: readonly AlchemixV2Sort[] = ["lastActivity", "debt", "created", "events"];
/** The sign of the frozen debt. */
const STATUSES = ["debt", "credit", "none"] as const;

/** An account is an address. Anything else costs no request. */
export const ALCHEMIX_V2_ACCOUNT = /^0x[a-fA-F0-9]{40}$/;

export interface FetchAlchemixV2PositionsParams {
  lines?: string[];
  owner?: string;
  status?: string[];
  sortBy?: AlchemixV2Sort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

/** Decode the proxy's query string. Anything unrecognised is dropped, so a
 *  stale URL still lists rather than drawing the backend's 400. */
export function parseAlchemixV2Query(sp: URLSearchParams): FetchAlchemixV2PositionsParams {
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
  return {
    lines: list("line"),
    owner: owner && ALCHEMIX_V2_ACCOUNT.test(owner) ? owner.toLowerCase() : undefined,
    status: list("status").filter((s) => (STATUSES as readonly string[]).includes(s)),
    sortBy: SORTS.includes(sortBy as AlchemixV2Sort) ? (sortBy as AlchemixV2Sort) : undefined,
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
    limit: num("limit"),
    offset: num("offset"),
  };
}

export function alchemixV2Query(p: FetchAlchemixV2PositionsParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (p.lines && p.lines.length > 0) qs.set("line", p.lines.join(","));
  if (p.owner) qs.set("owner", p.owner);
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

export function readAlchemixV2Positions(
  p: FetchAlchemixV2PositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixV2PositionsResponse>> {
  return read<AlchemixV2PositionsResponse>(
    `/api/alchemix/v2/positions?${alchemixV2Query(p).toString()}`,
    readerIp,
    signal,
  );
}

export function readAlchemixV2Position(
  lineKey: string,
  account: string,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<AlchemixRead<AlchemixV2PositionFullResponse>> {
  return read<AlchemixV2PositionFullResponse>(
    `/api/alchemix/v2/position/${encodeURIComponent(lineKey)}/${encodeURIComponent(account.toLowerCase())}`,
    readerIp,
    signal,
  );
}
