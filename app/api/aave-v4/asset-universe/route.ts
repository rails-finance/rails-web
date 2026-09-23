import { NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import type { AaveV4AssetUniverseResponse } from "@/lib/api/fetch-aave-v4-asset-universe";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's `/api/aave-v4/asset-universe`. Powers the
 * Supplying / Borrowing multi-select pills on /aave-v4.
 *
 * Forwards the optional `spokes` / `spoke` / `hubs` query params: with a market
 * filter the backend returns config-truthful per-market availability
 * (canSupply / canBorrow from the on-chain reserve config), without one it
 * returns the global empirical universe. The Express handler short-TTL-caches
 * (5 min) since both the universe and reserve config shift rarely.
 */
export async function GET(request: Request) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const incoming = new URL(request.url).searchParams;
    const forwarded = new URLSearchParams();
    for (const key of ["spokes", "spoke", "hubs"]) {
      for (const value of incoming.getAll(key)) forwarded.append(key, value);
    }
    const qs = forwarded.toString();
    const url = `${RAILS_API_URL}/api/aave-v4/asset-universe${qs ? `?${qs}` : ""}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const data: AaveV4AssetUniverseResponse = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching aave-v4 asset-universe from backend:", error);
    return NextResponse.json({ error: "Failed to fetch asset universe" }, { status: 500 });
  }
}
