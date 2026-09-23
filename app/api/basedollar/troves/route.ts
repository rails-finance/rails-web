import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildBasedollarTroveRows, type RawBasedollarTroveRow } from "@/lib/sources/api/basedollar-troves";
import { resolveLiquityForkPrices } from "@/lib/sources/chain/liquity-fork-prices";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { BASEDOLLAR_BRANCHES } from "@/lib/basedollar/asset-catalog";

// api arm of the Basedollar trove listing — the LIVE rails-server index. rails-server does
// the structural filter/sort/paginate over mv_basedollar_positions and returns the page
// slice already shaped as TroveSummary; we narrow each row to the Basedollar card fields
// and value it at each branch's OWN PriceFeed (one multicall, resolved alongside the
// backend fetch — an RPC failure just leaves the rows unpriced). Returns the
// { success, data, pagination } envelope.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

interface TrovesBackendResponse {
  success: boolean;
  data: RawBasedollarTroveRow[];
  pagination: { total: number; page: number; limit: number };
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ success: false, error: "Server configuration error" }, { status: 500 });
  }

  const sp = request.nextUrl.searchParams;
  try {
    const qs = new URLSearchParams();
    if (sp.get("troveId")) qs.set("troveId", sp.get("troveId")!);
    if (sp.get("collateralTypes")) qs.set("collateralTypes", sp.get("collateralTypes")!);
    if (sp.get("status")) qs.set("status", sp.get("status")!);
    if (sp.get("sortBy")) qs.set("sortBy", sp.get("sortBy")!);
    qs.set("sortOrder", sp.get("sortOrder") === "asc" ? "asc" : "desc");
    if (sp.get("limit") != null) qs.set("limit", sp.get("limit")!);
    if (sp.get("offset") != null) qs.set("offset", sp.get("offset")!);

    const url = `${RAILS_API_URL}/api/basedollar/troves?${qs.toString()}`;
    const [response, prices] = await Promise.all([
      fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp)),
      // Base, not Ethereum — the branch PriceFeeds only answer on 8453.
      resolveLiquityForkPrices(Object.values(BASEDOLLAR_BRANCHES), BASE_CHAIN_ID),
    ]);
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { success: false, error: `Backend error: ${response.statusText}` },
        { status: response.status },
      );
    }
    const raw = (await response.json()) as TrovesBackendResponse;
    const data = buildBasedollarTroveRows(raw.data ?? [], prices);
    const { total, page, limit } = raw.pagination ?? { total: data.length, page: 1, limit: data.length };
    return NextResponse.json(
      {
        success: true,
        data,
        pagination: { total, limit, offset: (Math.max(page, 1) - 1) * limit },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching basedollar troves from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch troves";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
