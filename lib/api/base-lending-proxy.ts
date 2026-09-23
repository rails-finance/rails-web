// The Base lending listing proxies — one copy of the rails-server hop that
// /api/seamless and /api/aave-v3-base both make.
//
// rails-server's /api/<protocol>/positions (mig 170) serves one row per
// account that ever held a position, joined to that account's chain truth at
// a pinned Base block; it filters, sorts and pages. This arm resolves symbols
// and oracle USD ON BASE against the deployment's own contracts and assembles
// the rows the shared Aave V3 listing renders. The response also carries
// `coverage` — how complete the lane is — which the page states.

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import {
  buildAaveV3PositionRows,
  type AaveV3ListingDeployment,
  type RawV3WalletRow,
} from "@/lib/sources/api/aave-v3-positions";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";

export interface BaseLendingProxyTarget {
  /** rails-server mount, e.g. "/api/seamless". */
  apiPrefix: string;
  /** The Base contracts symbols and USD resolve against. */
  deployment: AaveV3ListingDeployment;
  /** For log lines only. */
  label: string;
}

interface PositionsRawResponse {
  rows: RawV3WalletRow[];
  total: number;
  limit: number;
  offset: number;
  coverage: BaseLendingCoverage | null;
}

export async function proxyBaseLendingPositions(request: NextRequest, t: BaseLendingProxyTarget) {
  const readerIp = readerIpFromRequest(request);
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    let wallet = sp.get("wallet") ?? undefined;
    const ownerEns = sp.get("ownerEns");
    if (ownerEns && !wallet) {
      const resolved = await resolveEnsAddress(ownerEns);
      if (resolved) wallet = resolved;
    }

    const qs = new URLSearchParams();
    if (wallet) qs.set("wallet", wallet);
    if (sp.get("hasDebt") === "true") qs.set("hasDebt", "true");
    if (sp.get("noDebt") === "true") qs.set("noDebt", "true");
    if (sp.get("hasLiquidations") === "true") qs.set("hasLiquidations", "true");
    if (sp.get("hasLiquidations") === "false") qs.set("hasLiquidations", "false");
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    // Asset facets arrive as ADDRESSES on this lane (no curated Base catalog to
    // map symbols through); pass them straight down.
    if (sp.get("supplyAssets")) qs.set("supplyAssets", sp.get("supplyAssets")!);
    if (sp.get("borrowAssets")) qs.set("borrowAssets", sp.get("borrowAssets")!);
    // Allowlist, like sortOrder: an unrecognised value is dropped rather than
    // forwarded verbatim, so rails-server's own default (recent) decides it.
    // Shared by both Base lenders (seamless, aave-v3-base) — one proxy body.
    const sortBy = sp.get("sortBy");
    if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}${t.apiPrefix}/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const rows = await buildAaveV3PositionRows(raw.rows, t.deployment);
    return NextResponse.json(
      { rows, total: raw.total, limit: raw.limit, offset: raw.offset, coverage: raw.coverage ?? null },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error(`Error fetching ${t.label} positions from backend:`, error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** rails-server's /api/<protocol>/coverage (base_lending_coverage, mig 170). */
export async function proxyBaseLendingCoverage(apiPrefix: string, readerIp?: string) {
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  try {
    const response = await fetch(`${RAILS_API_URL}${apiPrefix}/coverage`, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok)
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    const json = await response.json();
    return NextResponse.json(json, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch coverage";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
