// The Alchemix V2 listing's query: its params, the proxy's decode and the
// backend's encode. Pure, so the browser fetcher can import it without the
// server read (lib/sources/api/alchemix-v2-backend.ts).

import { parseWholeBounds, setBounds, type AlchemixBoundKey } from "@/lib/sources/api/alchemix-bounds";

/** The backend's sort vocabulary. */
export type AlchemixV2Sort = "lastActivity" | "debt" | "created" | "events";

const SORTS: readonly AlchemixV2Sort[] = ["lastActivity", "debt", "created", "events"];
/** The sign of the frozen debt. */
const STATUSES = ["debt", "credit", "none"] as const;

/** An account is an address. Anything else costs no request. */
export const ALCHEMIX_V2_ACCOUNT = /^0x[a-fA-F0-9]{40}$/;

/** Debt alone: the collateral was swept, so no collateral bound is sent. */
const V2_BOUNDS: readonly AlchemixBoundKey[] = ["minDebtUsd", "maxDebtUsd", "minTx", "maxTx"];

export interface FetchAlchemixV2PositionsParams {
  lines?: string[];
  owner?: string;
  status?: string[];
  minDebtUsd?: number;
  maxDebtUsd?: number;
  minTx?: number;
  maxTx?: number;
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
    ...parseWholeBounds(sp, V2_BOUNDS),
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
  setBounds(qs, p, V2_BOUNDS);
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  qs.set("sortOrder", p.sortOrder === "asc" ? "asc" : "desc");
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs;
}
