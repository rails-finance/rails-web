import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { buildFluidPositionRows, type RawFluidPositionRow } from "@/lib/sources/api/fluid-positions";

// api arm of the Fluid positions listing — one row per position NFT from
// mv_fluid_positions, each carrying the fluid_position_chain settled overlay
// when present (the worker's resolver sweep: liquidations + accrued interest
// applied by the protocol's own math). Filters pass through verbatim.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;

const PASSTHROUGH = [
  "wallet",
  "nft",
  "hasDebt",
  "noDebt",
  "wasLiquidated",
  "status",
  "supplyAssets",
  "borrowAssets",
  "vaultKind",
  "sortBy",
  "sortOrder",
  "limit",
  "offset",
] as const;

interface PositionsResponse {
  rows: RawFluidPositionRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const qs = new URLSearchParams();
    for (const key of PASSTHROUGH) {
      const v = request.nextUrl.searchParams.get(key);
      if (v != null && v !== "") qs.set(key, v);
    }
    const url = `${RAILS_API_URL}/api/fluid/positions?${qs.toString()}`;
    const response = await fetch(url, createAuthFetchOptions({ signal: request.signal }, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const json = (await response.json()) as PositionsResponse;
    return NextResponse.json(
      {
        success: true,
        data: buildFluidPositionRows(json.rows ?? []),
        pagination: { total: json.total ?? 0, limit: json.limit ?? 20, offset: json.offset ?? 0 },
      },
      { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) },
    );
  } catch (error) {
    console.error("Error fetching fluid positions from backend:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch positions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
