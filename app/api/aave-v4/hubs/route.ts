import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import type { AaveV4HubsResponse } from "@/lib/api/fetch-aave-v4-hubs";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's `/api/aave-v4/hubs`. Powers the cross-hub
 * comparison surface at /aave-v4/hubs — the three V4 hubs' credit lines, caps,
 * utilisation and active-position counts, side by side.
 *
 * No query params; one cacheable payload for everyone. The Express handler
 * short-TTL-caches (60s) since the credit-line / cap data is governance-rare
 * and utilisation only needs hour-scale freshness on a reference surface.
 *
 * Each line's `lt` is the spoke's collateral factor at its current config key,
 * null where the spoke sets 0, with `ltBlock`, the block rails-server's Aave V4
 * refresher read it at (stored each cycle; rails-ops decisions/0056 step 2).
 */
export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const url = `${RAILS_API_URL}/api/aave-v4/hubs`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const indexed: AaveV4HubsResponse = await response.json();
    return NextResponse.json(indexed, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching aave-v4 hubs from backend:", error);
    return NextResponse.json({ error: "Failed to fetch hubs" }, { status: 500 });
  }
}
