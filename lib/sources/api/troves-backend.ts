// The Liquity V2 trove listing's backend read — one page of rails-server's
// /api/troves, read DIRECTLY from RAILS_API_URL with the bearer token.
// SERVER-ONLY (the token must not reach the browser bundle): called by the
// /api/troves proxy, which is its JSON face, and by the wallet share-image
// route, which used to hop back through that proxy. The reasons the share
// route stopped hopping are in lib/sources/api/polaris-positions-backend.ts;
// they are the same here.
//
// The proxy was never only a hop: it translates the page's params onto the
// backend's (status buckets, the two collateral-type forms) and forward-
// resolves an ENS owner to an address before asking. That work lives here now,
// once, so the proxy and the share route read the same wire the same way. The
// proxy keeps its 400s — validation is a response, and belongs to the route.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import type { TrovesResponse } from "@/types/api/trove";

// Display buckets (active/zombie/closed/liquidated); legacy raw values (open)
// and "all" are tolerated for inbound bookmark stability. The backend resolves
// buckets onto (status, is_zombie) predicates. Unknown tokens are dropped
// silently, as unknown collateral types are.
const VALID_STATUS_TOKENS = ["active", "zombie", "open", "closed", "liquidated", "all"];
const VALID_COLLATERAL_TYPES = ["WETH", "wstETH", "rETH"];

export type TrovesRead =
  | { ok: true; data: TrovesResponse; upstream: Response }
  | { ok: false; status: number; statusText: string };

/**
 * One page of the trove listing from the backend, for the proxy's own search
 * params (already validated by the route). `readerIp` is the human (or
 * scraper) on the other end, sent as X-Rails-Reader-IP so the box budgets
 * them, not this deployment's egress. Throws only when RAILS_API_URL is unset
 * or the network fails; a backend refusal is returned as `{ ok: false }` with
 * the backend's own status so the proxy can pass it on. The proxy passes its
 * `request.signal` as `signal`, so a caller that hangs up closes the fetch to
 * rails-server, which then cancels the query behind it.
 */
export async function readTrovesFromBackend(
  searchParams: URLSearchParams,
  readerIp?: string,
  signal?: AbortSignal,
): Promise<TrovesRead> {
  const base = process.env.RAILS_API_URL;
  if (!base) throw new Error("RAILS_API_URL environment variable is not set");

  const troveId = searchParams.get("troveId");
  const status = searchParams.get("status");
  const collateralType = searchParams.get("collateralType");
  const collateralTypesParam = searchParams.get("collateralTypes");
  const ownerAddress = searchParams.get("ownerAddress");
  const ownerEns = searchParams.get("ownerEns");
  const activeWithin = searchParams.get("activeWithin");
  const createdWithin = searchParams.get("createdWithin");
  const batchOnly = searchParams.get("batchOnly") === "true";
  const individualOnly = searchParams.get("individualOnly") === "true";
  const hasRedemptionsParam = searchParams.get("hasRedemptions");
  const showZombieParam = searchParams.get("showZombie");
  const sortBy = searchParams.get("sortBy");
  const sortOrder = searchParams.get("sortOrder");
  const limit = searchParams.get("limit");
  const offset = searchParams.get("offset");

  const backendParams = new URLSearchParams();
  if (troveId) backendParams.set("troveId", troveId);
  // Forward the validated status buckets as a comma-separated list.
  const statusTokens = (status ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID_STATUS_TOKENS.includes(s));
  if (statusTokens.length > 0) {
    backendParams.set("status", Array.from(new Set(statusTokens)).join(","));
  }
  // Forward the multi-select form when present, fall back to the legacy
  // single param. The backend accepts either.
  const collateralTypeList = (collateralTypesParam ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c && VALID_COLLATERAL_TYPES.includes(c));
  if (collateralTypeList.length > 0) {
    backendParams.set("collateralTypes", collateralTypeList.join(","));
  } else if (collateralType && VALID_COLLATERAL_TYPES.includes(collateralType)) {
    backendParams.set("collateralType", collateralType);
  }
  // Owner filter. Prefer an explicit address; otherwise forward-resolve the
  // ENS name to an address and filter by that (reliable for any on-chain
  // wallet). If resolution fails, pass the ENS name through so the backend
  // can still try its reverse-resolution cache.
  if (ownerAddress) {
    backendParams.set("ownerAddress", ownerAddress);
  } else if (ownerEns) {
    const resolved = await resolveEnsAddress(ownerEns);
    if (resolved) backendParams.set("ownerAddress", resolved);
    else backendParams.set("ownerEns", ownerEns);
  }
  if (activeWithin) backendParams.set("activeWithin", activeWithin);
  if (createdWithin) backendParams.set("createdWithin", createdWithin);
  if (batchOnly) backendParams.set("batchOnly", "true");
  if (individualOnly) backendParams.set("individualOnly", "true");
  if (hasRedemptionsParam === "true" || hasRedemptionsParam === "false") {
    backendParams.set("hasRedemptions", hasRedemptionsParam);
  }
  if (showZombieParam === "true" || showZombieParam === "false") {
    backendParams.set("showZombie", showZombieParam);
  }
  if (sortBy) backendParams.set("sortBy", sortBy);
  if (sortOrder) backendParams.set("sortOrder", sortOrder);
  if (limit) backendParams.set("limit", limit);
  if (offset) backendParams.set("offset", offset);

  const url = `${base}/api/troves${backendParams.toString() ? `?${backendParams.toString()}` : ""}`;
  const response = await fetch(url, { ...createAuthFetchOptions({ signal }, readerIp), cache: "no-store" });
  if (!response.ok) return { ok: false, status: response.status, statusText: response.statusText };
  const data = (await response.json()) as TrovesResponse;
  return { ok: true, data, upstream: response };
}
