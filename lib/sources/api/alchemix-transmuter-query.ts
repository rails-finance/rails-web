// The Transmuter listing's query: its params, the proxy's decode and the
// backend's encode. Pure, so the browser fetcher can import it without the
// server read (lib/sources/api/alchemix-transmuter-backend.ts).

import { parseWholeBounds, setBounds, type AlchemixBoundKey } from "@/lib/sources/api/alchemix-bounds";

/** The backend's sort vocabulary (`TRANSMUTER_SORTS` on the route). */
export type AlchemixTransmuterSort = "maturity" | "amount" | "created" | "nftId";

const SORTS: readonly AlchemixTransmuterSort[] = ["maturity", "amount", "created", "nftId"];
/** `maturing` and `matured` split `outstanding` in two against the indexed
 *  frontier; the facet offers those two and `claimed`, which never overlap. */
const STATUSES = ["maturing", "matured", "claimed", "outstanding"] as const;

/** The staked amount in USD, the position's one side. */
const TRANSMUTER_BOUNDS: readonly AlchemixBoundKey[] = ["minCollUsd", "maxCollUsd"];

export interface FetchAlchemixTransmuterPositionsParams {
  lines?: string[];
  chainId?: number;
  owner?: string;
  nftId?: string;
  status?: string[];
  minCollUsd?: number;
  maxCollUsd?: number;
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
    ...parseWholeBounds(sp, TRANSMUTER_BOUNDS),
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
  setBounds(qs, p, TRANSMUTER_BOUNDS);
  if (p.sortBy) qs.set("sortBy", p.sortBy);
  qs.set("sortOrder", p.sortOrder === "asc" ? "asc" : "desc");
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));
  return qs;
}
