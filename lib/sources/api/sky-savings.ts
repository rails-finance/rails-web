// Sky Savings backend reads — /api/sky-savings on RAILS_API_URL with the bearer
// token. SERVER-ONLY: called by the listing proxy (app/api/sky-savings) and by
// the explorer's server components, never from the browser bundle. Each read
// hands back the envelope (asOf, gate, coverage) beside its data, because a
// surface states no figure unless the gate passed.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type {
  SkyFlowDay,
  SkyPosition,
  SkyPositionsPage,
  SkyRates,
  SkyTimeline,
  SkyEnvelope,
} from "@/lib/sky-savings/types";

export type SkySort = "value" | "earned" | "lastActivity" | "events";
export type SkyStatus = "open" | "closed" | "all";

export interface SkyPositionsQuery {
  status?: SkyStatus;
  sortBy?: SkySort;
  sortOrder?: "asc" | "desc";
  owner?: string;
  limit?: number;
  offset?: number;
}

export class SkyReadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function read<T>(path: string, readerIp?: string, signal?: AbortSignal): Promise<T> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");
  const res = await fetch(`${base}/api/sky-savings${path}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!res.ok) throw new SkyReadError(res.status, `sky-savings ${path.split("?")[0]}: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

/** The proxy's search params → a typed query. Anything unrecognised is
 *  dropped so the backend's default decides it. */
export function parseSkyPositionsQuery(sp: URLSearchParams): SkyPositionsQuery {
  const status = sp.get("status");
  const sortBy = sp.get("sortBy");
  const owner = sp.get("owner");
  const limit = Number(sp.get("limit"));
  const offset = Number(sp.get("offset"));
  return {
    status: status === "open" || status === "closed" || status === "all" ? status : undefined,
    sortBy:
      sortBy === "value" || sortBy === "earned" || sortBy === "lastActivity" || sortBy === "events"
        ? sortBy
        : undefined,
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
    owner: owner && /^0x[0-9a-fA-F]{40}$/.test(owner) ? owner.toLowerCase() : undefined,
    limit: sp.get("limit") != null && Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : undefined,
    offset: sp.get("offset") != null && Number.isFinite(offset) ? Math.max(offset, 0) : undefined,
  };
}

export async function readSkyPositions(
  q: SkyPositionsQuery,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<SkyPositionsPage> {
  const qs = new URLSearchParams();
  if (q.status) qs.set("status", q.status);
  if (q.sortBy) qs.set("sortBy", q.sortBy);
  qs.set("sortOrder", q.sortOrder === "asc" ? "asc" : "desc");
  if (q.owner) qs.set("owner", q.owner);
  if (q.limit != null) qs.set("limit", String(q.limit));
  if (q.offset != null) qs.set("offset", String(q.offset));
  const raw = await read<SkyPositionsPage & { success: boolean }>(`/positions?${qs.toString()}`, readerIp, signal);
  return {
    data: raw.data ?? [],
    pagination: raw.pagination,
    excluded: raw.excluded ?? [],
    asOf: raw.asOf,
    gate: raw.gate,
    coverage: raw.coverage,
  };
}

/** One holder's row, or null for an address with no sUSDS history. */
export async function readSkyPosition(
  holder: string,
  readerIp?: string,
): Promise<(SkyEnvelope & { data: SkyPosition }) | null> {
  try {
    return await read<SkyEnvelope & { data: SkyPosition }>(`/position/${holder}`, readerIp);
  } catch (err) {
    if (err instanceof SkyReadError && err.status === 404) return null;
    throw err;
  }
}

/** The holder's newest `limit` events (newest first) and the rate changes
 *  inside the holder's span. */
export async function readSkyTimeline(
  holder: string,
  opts: { limit: number; order?: "asc" | "desc" },
  readerIp?: string,
): Promise<SkyTimeline> {
  const raw = await read<
    SkyEnvelope & {
      data: { events: SkyTimeline["events"]; marketNotes: SkyTimeline["marketNotes"] };
      pagination: { total: number };
    }
  >(`/position/${holder}/timeline?limit=${opts.limit}&order=${opts.order ?? "desc"}`, readerIp);
  return {
    events: raw.data.events,
    marketNotes: raw.data.marketNotes,
    total: raw.pagination.total,
    asOf: raw.asOf,
    gate: raw.gate,
    coverage: raw.coverage,
  };
}

/** One row per UTC day the holder has an event, or null where the route did
 *  not answer (the page then draws the ledger without the date scrubber). */
export async function readSkyFlowsDaily(holder: string, readerIp?: string): Promise<SkyFlowDay[] | null> {
  try {
    const raw = await read<{ data: { days: SkyFlowDay[] } }>(`/position/${holder}/flows/daily`, readerIp);
    return raw.data.days;
  } catch {
    return null;
  }
}

export async function readSkyRates(readerIp?: string): Promise<SkyRates> {
  const raw = await read<SkyEnvelope & { data: Omit<SkyRates, keyof SkyEnvelope> }>("/rates", readerIp);
  return { ...raw.data, asOf: raw.asOf, gate: raw.gate, coverage: raw.coverage };
}
