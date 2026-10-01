import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";

const RAILS_API_URL = process.env.RAILS_API_URL;

/**
 * Proxy to rails-server-onboarding's `/api/liquity-v2/prices/daily?collateralType=`
 * (WETH, wstETH or rETH): the branch's collateral price per UTC day, the last
 * any Trove's operation recorded on the branch that day,
 * `{ collateralType, obs: [[day, usd], …], today }`. The Lifetime flows panel
 * values a Trove's collateral between its events at it (lib/shared/liquity-flows.ts).
 */
export async function GET(request: NextRequest) {
  const readerIp = readerIpFromRequest(request);
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const collateralType = request.nextUrl.searchParams.get("collateralType") ?? "";
    const url = `${RAILS_API_URL}/api/liquity-v2/prices/daily?collateralType=${encodeURIComponent(collateralType)}`;
    const response = await fetch(url, createAuthFetchOptions(undefined, readerIp));
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: `Backend error: ${response.statusText}` }, { status: response.status });
    }
    const data = await response.json();
    return NextResponse.json(data, { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Liquity V2 daily prices from backend:", error);
    return NextResponse.json({ error: "Failed to fetch the daily prices" }, { status: 500 });
  }
}
