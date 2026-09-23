import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { LISTING_CACHE_CONTROL, proxyCacheControl } from "@/lib/api/proxy-cache";
import { resolveEnsAddress } from "@/lib/ens/resolve-ens";
import type { AaveV4SpokePositionsResponse } from "@/lib/api/fetch-aave-v4-spoke-positions";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's `/api/aave-v4/spoke-positions` list endpoint.
 * Pass-through of all query params (spoke, wallet, ownerEns, hasDebt, noDebt,
 * healthBelow, activeWithin, sortBy, sortOrder, limit, offset). The Express
 * route handles validation and a 5s statement timeout.
 */
export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    const params = new URLSearchParams(request.nextUrl.searchParams);

    // Forward-resolve ENS → wallet when no explicit wallet is given. Filtering
    // by the resolved address is reliable for any on-chain wallet; if it
    // doesn't resolve, leave ownerEns in place for the backend's reverse cache.
    const ownerEns = params.get("ownerEns");
    if (ownerEns && !params.get("wallet")) {
      const resolved = await resolveEnsAddress(ownerEns);
      if (resolved) {
        params.set("wallet", resolved);
        params.delete("ownerEns");
      }
    }

    const search = params.toString();
    const url = `${RAILS_API_URL}/api/aave-v4/spoke-positions${search ? `?${search}` : ""}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));

    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }

    const data: AaveV4SpokePositionsResponse = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response, LISTING_CACHE_CONTROL) });
  } catch (error) {
    console.error("Error fetching aave-v4 spoke-positions from backend:", error);
    return NextResponse.json({ error: "Failed to fetch spoke positions" }, { status: 500 });
  }
}
