// The Alchemix position listing's query: its params, the proxy's decode and the
// backend's encode. Pure, so the browser fetcher can import it without the
// server read (lib/sources/api/alchemix-positions-backend.ts).

import { parseWholeBounds, setBounds, type AlchemixBoundKey } from "@/lib/sources/api/alchemix-bounds";

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
  minDebtUsd?: number;
  maxDebtUsd?: number;
  minCollUsd?: number;
  maxCollUsd?: number;
  minTx?: number;
  maxTx?: number;
  sortBy?: AlchemixPositionSort;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
  /** Set on the SSR hop so the fetch reaches this deployment's own proxy. */
  baseUrl?: string;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

const POSITION_BOUNDS: readonly AlchemixBoundKey[] = [
  "minDebtUsd",
  "maxDebtUsd",
  "minCollUsd",
  "maxCollUsd",
  "minTx",
  "maxTx",
];

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
    ...parseWholeBounds(sp, POSITION_BOUNDS),
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
  setBounds(qs, p, POSITION_BOUNDS);
  // `lastActivity` is the backend's own default and is never sent by name.
  if (p.sortBy && p.sortBy !== "lastActivity") qs.set("sortBy", p.sortBy);
  qs.set("sortOrder", p.sortOrder === "asc" ? "asc" : "desc");
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs;
}
