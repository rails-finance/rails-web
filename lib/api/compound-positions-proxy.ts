// The Compound V3 listing proxies — one copy of the rails-server hop that
// /api/compound (Ethereum) and /api/compound-base make.
//
// rails-server does the structural filter / sort / paginate and returns the
// page slice as raw per-(market, account) rows; this arm resolves collateral
// symbols + scale and each market's own oracle USD against the DEPLOYMENT the
// route is for (buildCompoundPositionRows), and returns the { success, data,
// pagination } envelope. A Base route's response also carries `coverage` —
// how complete the lane is — which its page states.

import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildCompoundPositionRows, type RawCompoundPositionRow } from "@/lib/sources/api/compound-positions";
import type { CometDeployment } from "@/lib/compound/asset-catalog";
import type { BaseLendingCoverage } from "@/lib/api/fetch-aave-v3-positions";

export interface CompoundProxyTarget {
  /** rails-server mount, e.g. "/api/compound". */
  apiPrefix: string;
  deployment: CometDeployment;
  /** For log lines only. */
  label: string;
  /** True only where rails-server's route reads sortBy — Ethereum's mig 185
   *  debt_usd/collateral_usd on mv_compound_v3_positions, and the Base
   *  route's own USD sort keys. A future lane that pages a table without a
   *  sortBy column leaves this unset, so sortBy is dropped rather than
   *  forwarded to a backend that would silently ignore it — an explicit
   *  gate, not an assumption every route can honor a param another one
   *  added. */
  supportsSort?: boolean;
}

interface PositionsRawResponse {
  rows: RawCompoundPositionRow[];
  total: number;
  limit: number;
  offset: number;
  coverage?: BaseLendingCoverage | null;
}

export async function proxyCompoundPositions(request: NextRequest, t: CompoundProxyTarget) {
  const readerIp = readerIpFromRequest(request);
  const RAILS_API_URL = process.env.RAILS_API_URL;
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const qs = new URLSearchParams();
    if (sp.get("market")) qs.set("market", sp.get("market")!);
    if (sp.get("wallet")) qs.set("wallet", sp.get("wallet")!);
    if (sp.get("hasDebt")) qs.set("hasDebt", sp.get("hasDebt")!);
    if (sp.get("noDebt")) qs.set("noDebt", sp.get("noDebt")!);
    if (sp.get("hasLiquidations")) qs.set("hasLiquidations", sp.get("hasLiquidations")!);
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (t.supportsSort) {
      const sortBy = sp.get("sortBy");
      if (sortBy === "debt" || sortBy === "coll") qs.set("sortBy", sortBy);
    }
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}${t.apiPrefix}/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as PositionsRawResponse;
    const data = await buildCompoundPositionRows(raw.rows, t.deployment);
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total: raw.total, limit: raw.limit, offset: raw.offset },
        ...(raw.coverage !== undefined ? { coverage: raw.coverage ?? null } : {}),
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error(`Error fetching ${t.label} positions from backend:`, error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
