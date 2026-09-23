// The Polaris CDP listing's backend read — one page of rails-server's
// /api/polaris/positions, read DIRECTLY from RAILS_API_URL with the bearer
// token. SERVER-ONLY (the token must not reach the browser bundle): called by
// the /api/polaris/positions proxy, which is its JSON face, and by the wallet
// share-image route, which used to hop back through that proxy.
//
// Why the share route stopped hopping. A request from this deployment to its
// own /api/* proxy reaches the proxy from the function's own egress, so the
// proxy budgets it on the box as the deployment, not as the scraper who asked
// for the image: every share-card self-fetch shared one backend bucket, and
// the scraper was never budgeted at all. Forwarding a caller-supplied reader
// header through the proxy would be worse — the proxy always bears the token,
// and the box honours X-Rails-Reader-IP on every token-bearing request, so an
// anonymous caller could mint fresh backend keys. The shape the 54 file-
// convention share images already have is the right one: read the backend in
// process, with the reader's IP off the request that reached us.
//
// One interpretation of the wire. The proxy parses its search params with
// `parsePolarisPositionsQuery` (the allowlist that used to live in the route)
// and the read builds the backend query from the typed params; the client's
// fetchPolarisPositions builds the PROXY's query from the same typed shape.
// Presentation (scaling the 1e18 strings, the two-axis status) happens in
// buildPolarisPositionRows, exactly where it did.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { FetchPolarisPositionsParams, PolarisPositionsResult } from "@/lib/api/fetch-polaris-positions";
import {
  buildPolarisMarketBooks,
  buildPolarisPositionRows,
  type PolarisPositionStatus,
  type RawPolarisMarketRow,
  type RawPolarisPositionRow,
} from "@/lib/sources/api/polaris-positions";

interface PositionsRawResponse {
  rows: RawPolarisPositionRow[];
  total: number;
  limit: number;
  offset: number;
  markets?: RawPolarisMarketRow[];
}

export type PolarisPositionsRead =
  | { ok: true; result: PolarisPositionsResult; upstream: Response }
  | { ok: false; status: number; statusText: string };

/** The proxy's search params → the typed fetch params. An unrecognised
 *  market or sort is dropped rather than forwarded, so rails-server's own
 *  default decides it; everything else goes through as typed. */
export function parsePolarisPositionsQuery(sp: URLSearchParams): FetchPolarisPositionsParams {
  const market = sp.get("market");
  const sortBy = sp.get("sortBy");
  const hasDebt = sp.get("hasDebt");
  const limit = Number(sp.get("limit"));
  const offset = Number(sp.get("offset"));
  const status = (sp.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as PolarisPositionStatus[];
  return {
    market: market === "usdp" || market === "goldp" ? market : undefined,
    cdpId: sp.get("id") || undefined,
    wallet: sp.get("wallet") || undefined,
    status: status.length > 0 ? status : undefined,
    // hasDebt=1 → the last state carries debt; hasDebt=0 → collateral only.
    // (No `liquidated` param: on Polaris "ever liquidated" is the status
    // bucket — the NFT is burned and the id never reused.)
    hasDebt: hasDebt === "1" ? true : hasDebt === "0" ? false : undefined,
    sortBy: sortBy === "debt" || sortBy === "coll" || sortBy === "ratio" ? sortBy : undefined,
    sortOrder: sp.get("sortOrder") === "asc" ? "asc" : "desc",
    limit: sp.get("limit") != null && Number.isFinite(limit) ? limit : undefined,
    offset: sp.get("offset") != null && Number.isFinite(offset) ? offset : undefined,
  };
}

/**
 * One page of the CDP listing from the backend. `readerIp` is the human (or
 * scraper) on the other end, sent as X-Rails-Reader-IP so the box budgets
 * them, not this deployment's egress. Throws only when RAILS_API_URL is unset
 * or the network fails; a backend refusal is returned as `{ ok: false }` with
 * the backend's own status so the proxy can pass it on. The proxy passes its
 * `request.signal` as `signal`, so a caller that hangs up closes the fetch to
 * rails-server, which then cancels the query behind it.
 */
export async function readPolarisPositionsFromBackend(
  p: FetchPolarisPositionsParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<PolarisPositionsRead> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");

  const qs = new URLSearchParams();
  if (p.market) qs.set("market", p.market);
  if (p.cdpId) qs.set("id", p.cdpId);
  if (p.wallet) qs.set("wallet", p.wallet);
  if (p.status && p.status.length > 0) qs.set("status", p.status.join(","));
  if (p.hasDebt != null) qs.set("hasDebt", p.hasDebt ? "1" : "0");
  // `recent` is the backend's own default and is never sent by name.
  if (p.sortBy === "debt" || p.sortBy === "coll" || p.sortBy === "ratio") qs.set("sortBy", p.sortBy);
  qs.set("sortOrder", p.sortOrder === "asc" ? "asc" : "desc");
  if (p.limit != null) qs.set("limit", String(p.limit));
  if (p.offset != null) qs.set("offset", String(p.offset));

  const response = await fetch(`${base}/api/polaris/positions?${qs.toString()}`, {
    ...createAuthFetchOptions({ signal }, readerIp),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
  const raw = (await response.json()) as PositionsRawResponse;
  return {
    ok: true,
    upstream: response,
    result: {
      data: buildPolarisPositionRows(raw.rows),
      pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
      markets: buildPolarisMarketBooks(raw.markets),
    },
  };
}
